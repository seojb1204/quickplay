import { PADDLE, createPaddle, stepPaddle, type Dir, type PaddleState } from "@qp/shared";
import { outcomesFor, type ServerGameModule } from "./types.js";

/** 전송량을 줄이기 위해 정수로 반올림한 축약 상태 */
export interface PaddleWire {
  t: number;
  p: [number, number];
  b: [number, number];
  s: [number, number];
  w: boolean; // 서브 대기 중
}

const BROADCAST_EVERY = 2; // 60Hz 시뮬레이션, 30Hz 방송

export const paddleModule: ServerGameModule = {
  id: "paddle",
  create(ctx) {
    let state: PaddleState = createPaddle(ctx.seed);
    const inputs: [Dir, Dir] = [0, 0];
    let over = false;
    const tickMs = 1000 / PADDLE.TICK_HZ;

    const wire = (): PaddleWire => ({
      t: state.tick,
      p: [Math.round(state.paddles[0]), Math.round(state.paddles[1])],
      b: [Math.round(state.ball.x), Math.round(state.ball.y)],
      s: state.score,
      w: state.serveWait > 0,
    });

    // 실제 경과 시간 기준으로 밀린 틱을 따라잡는다(setInterval 지연 보정)
    ctx.setRepeat(() => {
      if (over) return;
      const due = Math.floor((ctx.now() - ctx.startAt) / tickMs);
      let steps = 0;
      while (state.tick < due && steps < 30 && !state.over) {
        state = stepPaddle(state, inputs);
        steps++;
        if (state.tick % BROADCAST_EVERY === 0) ctx.broadcast(wire());
      }
      if (state.over && !over) {
        over = true;
        ctx.broadcast(wire());
        const w = state.winner;
        ctx.end({
          reason: "normal",
          outcomes: outcomesFor(w),
          scores: state.score,
          summary:
            w === null
              ? `시간 종료 — ${state.score[0]}:${state.score[1]} 무승부`
              : `${ctx.nickname(w)} 승리 (${state.score[0]}:${state.score[1]})`,
        });
      }
    }, 10);

    return {
      snapshot: wire,
      action(seat, type, data) {
        if (over) return { ok: false, error: "GAME_OVER" };
        if (type !== "input") return { ok: false, error: "UNKNOWN_ACTION" };
        const dir = (data as { dir?: unknown } | null)?.dir;
        if (dir !== -1 && dir !== 0 && dir !== 1) return { ok: false, error: "BAD_DIR" };
        inputs[seat] = dir;
        return { ok: true };
      },
    };
  },
};
