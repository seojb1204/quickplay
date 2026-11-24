import type { EndReason, Outcome } from "@qp/shared";

export interface MatchEnd {
  reason: EndReason;
  outcomes: [Outcome, Outcome] | null;
  scores: [number, number];
  summary: string;
}

export interface MatchContext {
  matchId: string;
  seed: number;
  /** 카운트다운이 끝나는 시각 */
  startAt: number;
  nickname(seat: 0 | 1): string;
  broadcast(state: unknown): void;
  end(result: MatchEnd): void;
  now(): number;
  /** 타이머는 이 함수로 등록해야 경기 종료 시 일괄 정리된다 */
  setTimer(fn: () => void, ms: number): void;
  setRepeat(fn: () => void, ms: number): void;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export interface ServerMatch {
  /** 현재 상태(재접속한 플레이어에게 전송) */
  snapshot(): unknown;
  action(seat: 0 | 1, type: string, data: unknown): ActionResult;
}

export interface ServerGameModule {
  id: string;
  create(ctx: MatchContext): ServerMatch;
}

export function outcomesFor(winner: 0 | 1 | null): [Outcome, Outcome] {
  if (winner === null) return ["draw", "draw"];
  return winner === 0 ? ["win", "loss"] : ["loss", "win"];
}
