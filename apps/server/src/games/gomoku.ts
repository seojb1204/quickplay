import { applyGomokuMove, createGomoku, type GomokuState } from "@qp/shared";
import { outcomesFor, type ServerGameModule } from "./types.js";

export interface GomokuWire {
  board: number[];
  turn: 0 | 1;
  lastMove: number | null;
  moveCount: number;
  winLine: number[] | null;
  turnDeadline: number;
}

export const gomokuModule: ServerGameModule = {
  id: "gomoku",
  create(ctx) {
    let state: GomokuState = createGomoku();
    const turnMs = ctx.tuning.gomokuTurnMs;
    let deadline = ctx.startAt + turnMs;
    let turnTimerVersion = 0;
    let over = false;

    const wire = (): GomokuWire => ({
      board: state.board,
      turn: state.turn,
      lastMove: state.moves.at(-1) ?? null,
      moveCount: state.moves.length,
      winLine: state.winLine,
      turnDeadline: deadline,
    });

    const armTimer = () => {
      const v = ++turnTimerVersion;
      ctx.setTimer(() => {
        if (over || v !== turnTimerVersion) return;
        over = true;
        const loser = state.turn;
        const winner = loser === 0 ? 1 : 0;
        ctx.end({
          reason: "timeout",
          outcomes: outcomesFor(winner),
          scores: winner === 0 ? [1, 0] : [0, 1],
          summary: `${ctx.nickname(loser)} 시간 초과 — ${ctx.nickname(winner)} 승리`,
        });
      }, Math.max(0, deadline - ctx.now()));
    };
    armTimer();

    return {
      snapshot: wire,
      action(seat, type, data) {
        if (over) return { ok: false, error: "GAME_OVER" };
        if (type !== "move") return { ok: false, error: "UNKNOWN_ACTION" };
        if (ctx.now() < ctx.startAt) return { ok: false, error: "NOT_STARTED" };
        const index = (data as { index?: unknown } | null)?.index;
        if (typeof index !== "number") return { ok: false, error: "BAD_INDEX" };
        const r = applyGomokuMove(state, seat, index);
        if (!r.ok) return { ok: false, error: r.error };
        state = r.state;
        deadline = ctx.now() + turnMs;
        ctx.broadcast(wire());
        if (state.winner !== null || state.draw) {
          over = true;
          turnTimerVersion++;
          const w = state.winner;
          ctx.end({
            reason: "normal",
            outcomes: outcomesFor(w),
            scores: w === null ? [0, 0] : w === 0 ? [1, 0] : [0, 1],
            summary: w === null ? "무승부 — 판이 가득 찼습니다" : `${ctx.nickname(w)} 오목 완성!`,
          });
        } else {
          armTimer();
        }
        return { ok: true };
      },
    };
  },
};
