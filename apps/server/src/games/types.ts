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
  /** 테스트·운영 조정값 */
  tuning: { gomokuTurnMs: number };
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export interface ServerMatch {
  /** 현재 상태(재접속한 플레이어에게 전송) */
  snapshot(): unknown;
  action(seat: 0 | 1, type: string, data: unknown): ActionResult;
  /** 재접속(새로고침 포함)한 플레이어에게만 보낼 복구 정보 */
  resume?(seat: 0 | 1): unknown;
  /** 플레이어 연결이 끊겼을 때(유예 시간 시작) */
  onDisconnect?(seat: 0 | 1): void;
}

export interface ServerGameModule {
  id: string;
  create(ctx: MatchContext): ServerMatch;
}

export function outcomesFor(winner: 0 | 1 | null): [Outcome, Outcome] {
  if (winner === null) return ["draw", "draw"];
  return winner === 0 ? ["win", "loss"] : ["loss", "win"];
}
