/**
 * 실시간 연결 상태(소켓 1개)를 앱 전체에서 공유하는 작은 저장소.
 * React 컴포넌트는 useLive() 로 구독한다.
 */
import { useSyncExternalStore } from "react";
import { io, type Socket } from "socket.io-client";
import type { Ack, ClientToServer, MatchResult, MatchStart, RoomView, ServerToClient } from "@qp/shared";
import { API_BASE, ensureSession } from "./api";

export interface LiveState {
  status: "idle" | "connecting" | "online" | "offline" | "replaced";
  room: RoomView | null;
  queue: { gameId: string | null; since: number | null; waiting: number };
  start: MatchStart | null;
  /** 서버 시계 - 내 시계 (ms) */
  clockOffset: number;
  state: unknown;
  end: MatchResult | null;
}

let socket: Socket<ServerToClient, ClientToServer> | null = null;
let snapshot: LiveState = {
  status: "idle",
  room: null,
  queue: { gameId: null, since: null, waiting: 0 },
  start: null,
  clockOffset: 0,
  state: null,
  end: null,
};
const listeners = new Set<() => void>();
const stateListeners = new Set<(s: unknown) => void>();

function set(patch: Partial<LiveState>) {
  snapshot = { ...snapshot, ...patch };
  for (const l of listeners) l();
}

let started = false;

export function connectLive() {
  if (started) return; // StrictMode 이중 실행·중복 호출 방지
  started = true;
  set({ status: "connecting" });
  void ensureSession().then((s) => {
    socket = io(API_BASE || undefined, {
      auth: { token: s.token },
      transports: ["websocket", "polling"],
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
    });
    socket.on("connect", () => set({ status: "online" }));
    socket.on("disconnect", () => set({ status: snapshot.status === "replaced" ? "replaced" : "offline" }));
    socket.on("session:replaced", () => {
      set({ status: "replaced" });
      socket?.disconnect();
    });
    socket.on("room:state", (room) => set({ room }));
    socket.on("queue:status", (queue) => set({ queue }));
    socket.on("match:start", (m) => set({ start: m, end: null, state: null, clockOffset: m.serverNow - Date.now() }));
    socket.on("match:state", (st) => {
      // 실시간 게임은 초당 30회 갱신되므로 React 리렌더 대신 직접 구독자에게 전달
      snapshot = { ...snapshot, state: st };
      for (const l of stateListeners) l(st);
      if (!isHighFrequency()) for (const l of listeners) l();
    });
    socket.on("match:end", (end) => set({ end, start: null }));
  });
}

/** 오목처럼 상태가 드물게 바뀌는 게임만 React 리렌더 */
function isHighFrequency() {
  return snapshot.start?.gameId === "paddle";
}

export function onMatchState(fn: (s: unknown) => void): () => void {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
}

export function getLive() {
  return snapshot;
}

export function useLive(): LiveState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
  );
}

export function send<T = object>(ev: keyof ClientToServer, payload: object = {}): Promise<Ack<T>> {
  return new Promise((resolve) => {
    if (!socket || !socket.connected) {
      resolve({ ok: false, error: "BAD_REQUEST", message: "서버에 연결되어 있지 않습니다" });
      return;
    }
    const timer = setTimeout(() => resolve({ ok: false, error: "BAD_REQUEST", message: "응답 시간 초과" }), 5000);
    (socket.emit as (e: string, p: object, cb: (r: Ack<T>) => void) => void)(ev, payload, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
  });
}

/** 응답을 기다리지 않는 고빈도 입력 */
export function sendAction(type: string, data?: unknown) {
  socket?.emit("match:action", { type, data });
}

export function sendActionAck(type: string, data?: unknown): Promise<Ack> {
  return send("match:action", { type, data });
}

export function clearEnd() {
  set({ end: null });
}

export function reconnectLive() {
  socket?.connect();
  set({ status: "connecting" });
}

export const ERROR_TEXT: Record<string, string> = {
  ROOM_NOT_FOUND: "방을 찾을 수 없어요. 코드를 다시 확인해 주세요.",
  ROOM_FULL: "이미 두 명이 들어간 방이에요.",
  ALREADY_IN_ROOM: "이미 다른 방에 들어가 있어요.",
  ALREADY_QUEUED: "이미 랜덤 매칭을 기다리는 중이에요.",
  RATE_LIMITED: "요청이 너무 빨라요. 잠시 후 다시 시도해 주세요.",
  GAME_NOT_READY: "아직 준비 중인 게임이에요.",
  UNKNOWN_GAME: "알 수 없는 게임이에요.",
};

export function errorText(r: { error?: string; message?: string }) {
  return (r.error && ERROR_TEXT[r.error]) || r.message || "문제가 생겼어요. 다시 시도해 주세요.";
}
