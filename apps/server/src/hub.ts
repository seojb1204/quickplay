/**
 * 게임방·랜덤 매칭·경기 진행을 관리하는 공통 허브. 게임별 규칙은 games/* 모듈이 담당한다.
 *
 * 불변 조건
 * - 한 사용자는 동시에 최대 1개의 방 또는 1개의 매칭 대기열에만 있을 수 있다.
 * - 한 사용자의 소켓은 1개만 유효하다(새 탭/재접속이 이전 연결을 대체).
 * - 경기 결과는 경기당 정확히 1번만 확정·저장된다.
 */
import { randomBytes, randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import {
  isPlayable,
  randomSeed,
  type Ack,
  type ClientToServer,
  type EndReason,
  type ErrorCode,
  type MatchResult,
  type RoomView,
  type ServerToClient,
} from "@qp/shared";
import type { SessionUser } from "./auth.js";
import { serverGames } from "./games/registry.js";
import type { MatchEnd, ServerMatch } from "./games/types.js";
import { TokenBucket } from "./ratelimit.js";
import type { Store } from "./store/types.js";

type IO = Server<ClientToServer, ServerToClient>;
type Sock = Socket<ClientToServer, ServerToClient>;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const COUNTDOWN_MS = 3_000;

interface Player {
  user: SessionUser;
  seat: 0 | 1;
  ready: boolean;
  connected: boolean;
  graceTimer: NodeJS.Timeout | null;
  graceDeadline: number | null;
}

interface ActiveMatch {
  id: string;
  gameId: string;
  seed: number;
  startAt: number;
  startedAt: Date;
  game: ServerMatch;
  timers: Set<NodeJS.Timeout>;
  repeats: Set<NodeJS.Timeout>;
  ended: boolean;
}

interface Room {
  code: string;
  mode: "friend" | "random";
  gameId: string | null;
  phase: "lobby" | "playing" | "result";
  players: Player[];
  match: ActiveMatch | null;
  lastResult: MatchResult | null;
  matchCount: number;
}

interface QueueEntry {
  user: SessionUser;
  gameId: string;
  since: number;
}

const fail = (error: ErrorCode, message?: string): { ok: false; error: ErrorCode; message?: string } => ({
  ok: false,
  error,
  message,
});

export interface HubOptions {
  reconnectGraceMs: number;
  countdownMs?: number;
  gomokuTurnMs?: number;
  log?: (msg: string, extra?: object) => void;
}

export class Hub {
  readonly rooms = new Map<string, Room>();
  private userRoom = new Map<string, string>();
  private queue: QueueEntry[] = [];
  private sockets = new Map<string, Sock>();

  constructor(
    private io: IO,
    private store: Store,
    private opts: HubOptions,
  ) {}

  // ------------------------------------------------------------ connection

  attach(socket: Sock, user: SessionUser) {
    const prev = this.sockets.get(user.id);
    // 새 소켓을 먼저 등록해야 이전 소켓의 disconnect 처리가 "대체됨"으로 무시된다(대기열·준비 상태 유지)
    this.sockets.set(user.id, socket);
    if (prev && prev.id !== socket.id) {
      prev.emit("session:replaced");
      prev.disconnect(true);
    }

    const general = new TokenBucket(10, 20);
    const actions = new TokenBucket(40, 80);
    const guard =
      <A extends unknown[]>(bucket: TokenBucket, fn: (...args: A) => void) =>
      (...args: A) => {
        const ack = args.at(-1);
        if (!bucket.take()) {
          if (typeof ack === "function") (ack as (r: Ack) => void)(fail("RATE_LIMITED"));
          return;
        }
        try {
          fn(...args);
        } catch (e) {
          this.opts.log?.("handler error", { err: String(e) });
          if (typeof ack === "function") (ack as (r: Ack) => void)(fail("BAD_REQUEST"));
        }
      };
    const safeAck = <T>(ack: unknown): ((r: T) => void) => (typeof ack === "function" ? (ack as (r: T) => void) : () => {});

    socket.on("room:create", guard(general, (p, ack) => safeAck<Ack<{ code: string }>>(ack)(this.createRoom(user, p?.gameId))));
    socket.on("room:join", guard(general, (p, ack) => safeAck<Ack<{ code: string }>>(ack)(this.joinRoom(user, p?.code))));
    socket.on("room:leave", guard(general, (_p, ack) => safeAck<Ack>(ack)(this.leaveRoom(user.id, "leave"))));
    socket.on("room:selectGame", guard(general, (p, ack) => safeAck<Ack>(ack)(this.selectGame(user.id, p?.gameId))));
    socket.on("room:ready", guard(general, (p, ack) => safeAck<Ack>(ack)(this.setReady(user.id, p?.ready === true))));
    socket.on("queue:join", guard(general, (p, ack) => safeAck<Ack>(ack)(this.joinQueue(user, p?.gameId))));
    socket.on("queue:leave", guard(general, (_p, ack) => safeAck<Ack>(ack)(this.leaveQueue(user.id))));
    socket.on("match:forfeit", guard(general, (_p, ack) => safeAck<Ack>(ack)(this.forfeit(user.id))));
    socket.on(
      "match:action",
      guard(actions, (p, ack) => {
        const r = this.action(user.id, p?.type, p?.data);
        safeAck<Ack>(ack)(r);
      }),
    );

    socket.on("disconnect", () => this.onDisconnect(user.id, socket.id));

    // 재접속: 방에 있던 사용자면 상태 복구
    const code = this.userRoom.get(user.id);
    const room = code ? this.rooms.get(code) : undefined;
    if (room) {
      const pl = room.players.find((x) => x.user.id === user.id);
      if (pl) {
        pl.connected = true;
        if (pl.graceTimer) clearTimeout(pl.graceTimer);
        pl.graceTimer = null;
        pl.graceDeadline = null;
        socket.join(room.code);
        this.emitRoom(room);
        if (room.match && !room.match.ended) {
          socket.emit("match:start", { ...this.matchStartFor(room, pl.seat), resume: room.match.game.resume?.(pl.seat) });
          socket.emit("match:state", room.match.game.snapshot());
        }
      }
    }
    this.emitQueueStatus(user.id);
  }

  private onDisconnect(userId: string, socketId: string) {
    if (this.sockets.get(userId)?.id !== socketId) return; // 이미 새 연결로 대체됨
    this.sockets.delete(userId);
    this.leaveQueue(userId);
    const room = this.roomOf(userId);
    if (!room) return;
    const pl = room.players.find((x) => x.user.id === userId);
    if (!pl) return;
    pl.connected = false;
    pl.ready = false;
    if (room.match && !room.match.ended) this.safe(() => room.match?.game.onDisconnect?.(pl.seat));
    pl.graceDeadline = Date.now() + this.opts.reconnectGraceMs;
    pl.graceTimer = setTimeout(() => {
      pl.graceTimer = null;
      if (pl.connected) return;
      // 둘 다 끊긴 상태면 먼저 끊긴 쪽만 지는 것은 불공정 → 기록 없이 종료
      if (room.match && !room.match.ended && room.players.every((p) => !p.connected)) {
        this.finishMatch(room, room.match, {
          reason: "abandoned",
          outcomes: null,
          scores: [0, 0],
          summary: "양쪽 모두 연결이 끊겨 기록 없이 종료되었습니다",
        });
      }
      this.leaveRoom(userId, "disconnect");
    }, this.opts.reconnectGraceMs);
    this.emitRoom(room);
  }

  // ------------------------------------------------------------ rooms

  private roomOf(userId: string): Room | undefined {
    const code = this.userRoom.get(userId);
    return code ? this.rooms.get(code) : undefined;
  }

  private busy(userId: string): ErrorCode | null {
    if (this.userRoom.has(userId)) return "ALREADY_IN_ROOM";
    if (this.queue.some((q) => q.user.id === userId)) return "ALREADY_QUEUED";
    return null;
  }

  private newCode(): string {
    for (;;) {
      const b = randomBytes(6);
      let c = "";
      for (let i = 0; i < 6; i++) c += CODE_ALPHABET[b[i]! % CODE_ALPHABET.length];
      if (!this.rooms.has(c)) return c;
    }
  }

  private newPlayer(user: SessionUser, seat: 0 | 1): Player {
    return { user, seat, ready: false, connected: true, graceTimer: null, graceDeadline: null };
  }

  createRoom(user: SessionUser, gameId: unknown): Ack<{ code: string }> {
    const b = this.busy(user.id);
    if (b) return fail(b);
    if (gameId !== undefined && gameId !== null) {
      if (typeof gameId !== "string" || !serverGames.has(gameId) || !isPlayable(gameId)) return fail("UNKNOWN_GAME");
    }
    const room: Room = {
      code: this.newCode(),
      mode: "friend",
      gameId: (gameId as string | undefined) ?? null,
      phase: "lobby",
      players: [this.newPlayer(user, 0)],
      match: null,
      lastResult: null,
      matchCount: 0,
    };
    this.rooms.set(room.code, room);
    this.userRoom.set(user.id, room.code);
    this.sockets.get(user.id)?.join(room.code);
    this.emitRoom(room);
    return { ok: true, code: room.code };
  }

  joinRoom(user: SessionUser, rawCode: unknown): Ack<{ code: string }> {
    if (typeof rawCode !== "string") return fail("BAD_REQUEST");
    const code = rawCode.trim().toUpperCase();
    const current = this.userRoom.get(user.id);
    if (current === code) return { ok: true, code }; // 같은 방 재입장은 허용(새로고침)
    const b = this.busy(user.id);
    if (b) return fail(b);
    const room = this.rooms.get(code);
    if (!room || room.mode !== "friend") return fail("ROOM_NOT_FOUND");
    if (room.players.length >= 2) return fail("ROOM_FULL");
    const seat: 0 | 1 = room.players[0]?.seat === 0 ? 1 : 0;
    room.players.push(this.newPlayer(user, seat));
    room.players.sort((a, b) => a.seat - b.seat);
    // 새로 들어온 사람에게 이전 사람의 결과가 자기 결과처럼 보이지 않게
    room.lastResult = null;
    if (room.phase === "result") room.phase = "lobby";
    this.userRoom.set(user.id, code);
    this.sockets.get(user.id)?.join(code);
    this.emitRoom(room);
    return { ok: true, code };
  }

  leaveRoom(userId: string, why: "leave" | "disconnect"): Ack {
    const room = this.roomOf(userId);
    if (!room) return fail("NOT_IN_ROOM");
    const pl = room.players.find((x) => x.user.id === userId);
    if (room.phase === "playing" && room.match && !room.match.ended && pl) {
      this.endByLeave(room, pl.seat, why === "leave" ? "forfeit" : "disconnect");
    }
    if (pl?.graceTimer) clearTimeout(pl.graceTimer);
    room.players = room.players.filter((x) => x.user.id !== userId);
    this.userRoom.delete(userId);
    this.sockets.get(userId)?.leave(room.code);
    this.sockets.get(userId)?.emit("room:state", null);
    if (room.players.length === 0) {
      this.rooms.delete(room.code);
      return { ok: true };
    }
    for (const p of room.players) p.ready = false;
    // 남은 사람은 방금 경기의 당사자이므로 결과를 그대로 보여준다(새로 들어오는 사람이 오면 지움)
    if (room.mode === "friend") room.phase = room.lastResult ? "result" : "lobby";
    this.emitRoom(room);
    return { ok: true };
  }

  selectGame(userId: string, gameId: unknown): Ack {
    const room = this.roomOf(userId);
    if (!room) return fail("NOT_IN_ROOM");
    if (room.mode !== "friend") return fail("INVALID_ACTION", "랜덤 대전 방은 게임을 바꿀 수 없습니다");
    if (room.phase === "playing") return fail("INVALID_ACTION");
    if (typeof gameId !== "string" || !serverGames.has(gameId)) return fail("UNKNOWN_GAME");
    if (!isPlayable(gameId)) return fail("GAME_NOT_READY");
    if (room.gameId !== gameId) {
      room.gameId = gameId;
      for (const p of room.players) p.ready = false;
    }
    this.emitRoom(room);
    return { ok: true };
  }

  setReady(userId: string, ready: boolean): Ack {
    const room = this.roomOf(userId);
    if (!room) return fail("NOT_IN_ROOM");
    if (room.phase === "playing") return fail("INVALID_ACTION");
    if (!room.gameId) return fail("INVALID_ACTION", "먼저 게임을 선택하세요");
    const pl = room.players.find((x) => x.user.id === userId)!;
    pl.ready = ready;
    if (room.players.length === 2 && room.players.every((p) => p.ready && p.connected)) {
      this.startMatch(room);
    } else {
      this.emitRoom(room);
    }
    return { ok: true };
  }

  // ------------------------------------------------------------ random queue

  joinQueue(user: SessionUser, gameId: unknown): Ack {
    if (typeof gameId !== "string" || !serverGames.has(gameId)) return fail("UNKNOWN_GAME");
    if (!isPlayable(gameId)) return fail("GAME_NOT_READY");
    const b = this.busy(user.id);
    if (b) return fail(b);
    const idx = this.queue.findIndex((q) => q.gameId === gameId && this.sockets.has(q.user.id));
    if (idx >= 0) {
      const other = this.queue.splice(idx, 1)[0]!;
      this.createRandomRoom(other.user, user, gameId);
    } else {
      this.queue.push({ user, gameId, since: Date.now() });
      this.emitQueueStatus(user.id);
    }
    return { ok: true };
  }

  leaveQueue(userId: string): Ack {
    const before = this.queue.length;
    this.queue = this.queue.filter((q) => q.user.id !== userId);
    if (before !== this.queue.length) this.emitQueueStatus(userId);
    return { ok: true };
  }

  private emitQueueStatus(userId: string) {
    const q = this.queue.find((x) => x.user.id === userId);
    this.sockets.get(userId)?.emit("queue:status", {
      gameId: q?.gameId ?? null,
      since: q?.since ?? null,
      waiting: q ? this.queue.filter((x) => x.gameId === q.gameId).length : 0,
      serverNow: Date.now(),
    });
  }

  private createRandomRoom(a: SessionUser, b: SessionUser, gameId: string) {
    const room: Room = {
      code: this.newCode(),
      mode: "random",
      gameId,
      phase: "lobby",
      players: [this.newPlayer(a, 0), this.newPlayer(b, 1)],
      match: null,
      lastResult: null,
      matchCount: 0,
    };
    this.rooms.set(room.code, room);
    for (const p of room.players) {
      this.userRoom.set(p.user.id, room.code);
      this.sockets.get(p.user.id)?.join(room.code);
      this.emitQueueStatus(p.user.id);
    }
    this.startMatch(room);
  }

  // ------------------------------------------------------------ match lifecycle

  private matchStartFor(room: Room, seat: 0 | 1) {
    const m = room.match!;
    return { matchId: m.id, gameId: m.gameId, seat, seed: m.seed, startAt: m.startAt, serverNow: Date.now() };
  }

  private startMatch(room: Room) {
    const mod = serverGames.get(room.gameId!);
    if (!mod) return;
    // 재대결마다 자리를 바꿔 선공 이점을 번갈아 준다
    if (room.matchCount > 0 && room.players.length === 2) {
      for (const p of room.players) p.seat = p.seat === 0 ? 1 : 0;
      room.players.sort((a, b) => a.seat - b.seat);
    }
    room.matchCount++;
    for (const p of room.players) p.ready = false;
    const match: ActiveMatch = {
      id: randomUUID(),
      gameId: room.gameId!,
      seed: randomSeed(),
      startAt: Date.now() + (this.opts.countdownMs ?? COUNTDOWN_MS),
      startedAt: new Date(),
      game: undefined as unknown as ServerMatch,
      timers: new Set(),
      repeats: new Set(),
      ended: false,
    };
    room.match = match;
    room.phase = "playing";
    const nick = (seat: 0 | 1) => room.players.find((p) => p.seat === seat)?.user.nickname ?? "?";
    match.game = mod.create({
      matchId: match.id,
      seed: match.seed,
      startAt: match.startAt,
      nickname: nick,
      now: () => Date.now(),
      broadcast: (s) => {
        if (!match.ended) this.io.to(room.code).emit("match:state", s);
      },
      end: (r) => this.finishMatch(room, match, r),
      tuning: { gomokuTurnMs: this.opts.gomokuTurnMs ?? 30_000 },
      setTimer: (fn, ms) => {
        const t = setTimeout(() => {
          match.timers.delete(t);
          this.guardMatch(room, match, fn);
        }, ms);
        match.timers.add(t);
      },
      setRepeat: (fn, ms) => {
        const t = setInterval(() => this.guardMatch(room, match, fn), ms);
        match.repeats.add(t);
      },
    });
    this.emitRoom(room);
    for (const p of room.players) {
      this.sockets.get(p.user.id)?.emit("match:start", this.matchStartFor(room, p.seat));
    }
    this.io.to(room.code).emit("match:state", match.game.snapshot());
  }

  /** 게임 타이머 안의 예외가 서버 전체를 죽이지 않도록: 기록 없이 그 경기만 종료 */
  private guardMatch(room: Room, match: ActiveMatch, fn: () => void) {
    try {
      fn();
    } catch (e) {
      this.opts.log?.("match timer error", { err: String(e), matchId: match.id });
      this.finishMatch(room, match, { reason: "abandoned", outcomes: null, scores: [0, 0], summary: "서버 오류로 경기가 기록 없이 종료되었습니다" });
    }
  }

  private safe(fn: () => void) {
    try {
      fn();
    } catch (e) {
      this.opts.log?.("handler error", { err: String(e) });
    }
  }

  private endByLeave(room: Room, leaverSeat: 0 | 1, reason: EndReason) {
    const match = room.match!;
    const leaver = room.players.find((p) => p.seat === leaverSeat)!;
    if (room.mode === "friend") {
      this.finishMatch(room, match, {
        reason: "abandoned",
        outcomes: null,
        scores: [0, 0],
        summary: `${leaver.user.nickname} 님이 나가서 경기가 종료되었습니다 (친구전은 기록 없음)`,
      });
    } else {
      const winner: 0 | 1 = leaverSeat === 0 ? 1 : 0;
      this.finishMatch(room, match, {
        reason,
        outcomes: winner === 0 ? ["win", "loss"] : ["loss", "win"],
        scores: winner === 0 ? [1, 0] : [0, 1],
        summary: `${leaver.user.nickname} 님 ${reason === "disconnect" ? "연결 끊김" : "기권"} — 상대 승리`,
      });
    }
  }

  forfeit(userId: string): Ack {
    const room = this.roomOf(userId);
    if (!room) return fail("NOT_IN_ROOM");
    if (room.phase !== "playing" || !room.match || room.match.ended) return fail("NOT_PLAYING");
    const pl = room.players.find((x) => x.user.id === userId)!;
    this.endByLeave(room, pl.seat, "forfeit");
    return { ok: true };
  }

  action(userId: string, type: unknown, data: unknown): Ack {
    const room = this.roomOf(userId);
    if (!room) return fail("NOT_IN_ROOM");
    if (room.phase !== "playing" || !room.match || room.match.ended) return fail("NOT_PLAYING");
    if (typeof type !== "string" || type.length > 32) return fail("BAD_REQUEST");
    const pl = room.players.find((x) => x.user.id === userId)!;
    const r = room.match.game.action(pl.seat, type, data);
    return r.ok ? { ok: true } : fail("INVALID_ACTION", r.error);
  }

  private finishMatch(room: Room, match: ActiveMatch, r: MatchEnd) {
    if (match.ended) return; // 결과는 한 번만 확정
    match.ended = true;
    for (const t of match.timers) clearTimeout(t);
    for (const t of match.repeats) clearInterval(t);
    match.timers.clear();
    match.repeats.clear();

    const result: MatchResult = {
      matchId: match.id,
      gameId: match.gameId,
      mode: room.mode,
      reason: r.reason,
      outcomes: r.outcomes,
      scores: r.scores,
      summary: r.summary,
    };
    room.lastResult = result;
    room.phase = "result";
    room.match = null;
    for (const p of room.players) p.ready = false;
    this.io.to(room.code).emit("match:end", result);
    this.emitRoom(room);

    const players = room.players.map((p) => ({
      userId: p.user.id,
      seat: p.seat,
      outcome: r.outcomes ? r.outcomes[p.seat] : null,
      score: r.scores[p.seat],
    }));
    void this.store
      .saveMatch({
        id: match.id,
        gameId: match.gameId,
        mode: room.mode,
        reason: r.reason,
        startedAt: match.startedAt,
        endedAt: new Date(),
        players,
      })
      .catch((e) => this.opts.log?.("saveMatch failed", { err: String(e), matchId: match.id }));
  }

  // ------------------------------------------------------------ views

  private view(room: Room): RoomView {
    const graces = room.players.map((p) => p.graceDeadline).filter((x): x is number => x !== null);
    return {
      code: room.code,
      mode: room.mode,
      gameId: room.gameId,
      phase: room.phase,
      players: room.players.map((p) => ({
        id: p.user.id,
        nickname: p.user.nickname,
        seat: p.seat,
        connected: p.connected,
        ready: p.ready,
        guest: p.user.kind === "guest",
      })),
      lastResult: room.lastResult,
      reconnectDeadline: graces.length ? Math.min(...graces) : null,
    };
  }

  private emitRoom(room: Room) {
    this.io.to(room.code).emit("room:state", this.view(room));
  }

  /** 테스트·종료용: 모든 타이머 정리 */
  shutdown() {
    for (const room of this.rooms.values()) {
      if (room.match) {
        for (const t of room.match.timers) clearTimeout(t);
        for (const t of room.match.repeats) clearInterval(t);
      }
      for (const p of room.players) if (p.graceTimer) clearTimeout(p.graceTimer);
    }
  }
}
