/**
 * 브라우저 ↔ 서버 통신 규약 (Socket.IO 이벤트 + 공통 자료형).
 * 문서: docs/04-api-realtime-protocol.md
 */
export type Mode = "solo" | "friend" | "random";
export type Outcome = "win" | "loss" | "draw";
export type EndReason = "normal" | "timeout" | "forfeit" | "disconnect" | "abandoned";

export type ErrorCode =
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "BAD_REQUEST"
  | "UNKNOWN_GAME"
  | "GAME_NOT_READY"
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "ALREADY_IN_ROOM"
  | "ALREADY_QUEUED"
  | "NOT_IN_ROOM"
  | "NOT_PLAYING"
  | "INVALID_ACTION";

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: ErrorCode; message?: string };

export interface PlayerView {
  id: string;
  nickname: string;
  seat: 0 | 1;
  connected: boolean;
  ready: boolean;
  guest: boolean;
}

export interface MatchResult {
  matchId: string;
  gameId: string;
  mode: Exclude<Mode, "solo">;
  reason: EndReason;
  /** seat 별 결과. abandoned(친구전 중도 종료)면 null */
  outcomes: [Outcome, Outcome] | null;
  scores: [number, number];
  /** 사람이 읽을 결과 요약 */
  summary: string;
}

export interface RoomView {
  code: string;
  mode: "friend" | "random";
  gameId: string | null;
  phase: "lobby" | "playing" | "result";
  players: PlayerView[];
  lastResult: MatchResult | null;
  /** 재접속 대기 중인 상대가 있으면 그 마감 시각(ms epoch) */
  reconnectDeadline: number | null;
}

export interface MatchStart {
  matchId: string;
  gameId: string;
  seat: 0 | 1;
  seed: number;
  /** 카운트다운 후 실제 시작 시각(서버 시계 ms epoch) */
  startAt: number;
  serverNow: number;
  /** 재접속·새로고침 시 이어서 하기 위한 게임별 복구 정보(내 것만) */
  resume?: unknown;
}

/** 클라이언트 → 서버 */
export interface ClientToServer {
  "room:create": (p: { gameId?: string }, ack: (r: Ack<{ code: string }>) => void) => void;
  "room:join": (p: { code: string }, ack: (r: Ack<{ code: string }>) => void) => void;
  "room:leave": (p: object, ack: (r: Ack) => void) => void;
  "room:selectGame": (p: { gameId: string }, ack: (r: Ack) => void) => void;
  "room:ready": (p: { ready: boolean }, ack: (r: Ack) => void) => void;
  "queue:join": (p: { gameId: string }, ack: (r: Ack) => void) => void;
  "queue:leave": (p: object, ack: (r: Ack) => void) => void;
  "match:action": (p: { type: string; data?: unknown }, ack?: (r: Ack) => void) => void;
  "match:forfeit": (p: object, ack: (r: Ack) => void) => void;
}

/** 서버 → 클라이언트 */
export interface ServerToClient {
  "session:replaced": () => void;
  "room:state": (room: RoomView | null) => void;
  "queue:status": (s: { gameId: string | null; since: number | null; waiting: number; serverNow: number }) => void;
  "match:start": (m: MatchStart) => void;
  "match:state": (s: unknown) => void;
  "match:end": (r: MatchResult) => void;
}

export interface GuestSession {
  token: string;
  userId: string;
  nickname: string;
}

export interface GameStatsRow {
  gameId: string;
  plays: number;
  wins: number;
  losses: number;
  draws: number;
  best: number | null;
}

export interface RecentRow {
  gameId: string;
  mode: string;
  outcome: Outcome | null;
  score: number | null;
  reason: string;
  at: string;
}

export interface LeaderRow {
  rank: number;
  nickname: string;
  value: number;
}

export const QUEUE_HINT_AFTER_MS = 15_000;
export const RECONNECT_GRACE_MS = 15_000;
