/**
 * 뱀 기록 경쟁: 각 브라우저가 같은 시드로 직접 플레이하고 입력 기록을 조금씩 보낸다.
 * 서버는 받은 입력을 다시 시뮬레이션해서 점수를 계산하므로, 점수를 위조할 수 없다.
 * - 입력의 틱은 이미 보고한 진행 틱(upTo)보다 커야 한다 → 과거를 고쳐 쓰기 금지
 * - upTo 는 실제 경과 시간 + 여유(2초)를 넘을 수 없다 → 미래를 미리 보내기 금지
 * - 보고가 실제 시간보다 5초 넘게 뒤처지면 그 시점에서 동결(이후 입력 무시, 마지막 방향으로 진행)
 *   → 입력을 몰래 쌓아 두었다가 유리하게 고르는 행위 차단
 * - 제한 시간이 지나면 입력이 끊긴 쪽도 마지막 방향 그대로 끝까지 시뮬레이션해 확정
 */
import { SNAKE, advanceSnake, compareSnake, createSnake, validateSnakeInputs, type SnakeInput, type SnakeState } from "@qp/shared";
import { outcomesFor, type ServerGameModule } from "./types.js";

export interface SnakeWire {
  scores: [number, number];
  dead: [boolean, boolean];
  ticks: [number, number];
  frozen: [boolean, boolean];
  endsAt: number;
}

export interface SnakeResume {
  inputs: SnakeInput[];
  upTo: number;
  frozen: boolean;
}

const SLACK_TICKS = 16; // 2초 앞서기 허용
const MAX_LAG_TICKS = 40; // 5초 뒤처지면 동결
const FINAL_GRACE_MS = 3_000;

export const snakeModule: ServerGameModule = {
  id: "snake",
  create(ctx) {
    const logs: [SnakeInput[], SnakeInput[]] = [[], []];
    const upTo: [number, number] = [0, 0];
    const sims: [SnakeState, SnakeState] = [createSnake(ctx.seed), createSnake(ctx.seed)];
    const done: [boolean, boolean] = [false, false];
    const frozen: [boolean, boolean] = [false, false];
    const endsAt = ctx.startAt + SNAKE.VERSUS_TICKS * SNAKE.TICK_MS;
    let over = false;

    const elapsedTicks = () => Math.floor((ctx.now() - ctx.startAt) / SNAKE.TICK_MS);

    const wire = (): SnakeWire => ({
      scores: [sims[0].score, sims[1].score],
      dead: [sims[0].dead, sims[1].dead],
      ticks: [sims[0].tick, sims[1].tick],
      frozen: [frozen[0], frozen[1]],
      endsAt,
    });

    const finish = () => {
      if (over) return;
      over = true;
      for (const seat of [0, 1] as const) {
        sims[seat] = advanceSnake(sims[seat], logs[seat], SNAKE.VERSUS_TICKS);
      }
      ctx.broadcast(wire());
      const c = compareSnake(sims[0], sims[1]);
      const winner = c === 0 ? null : c === 1 ? 0 : 1;
      const sc: [number, number] = [sims[0].score, sims[1].score];
      ctx.end({
        reason: "normal",
        outcomes: outcomesFor(winner),
        scores: sc,
        summary:
          winner === null
            ? `${sc[0]}:${sc[1]} 무승부`
            : `${ctx.nickname(winner)} 승리 (${sc[0]}:${sc[1]})` + (sc[0] === sc[1] ? " — 먼저 도달" : ""),
      });
    };

    const freezeIfLagging = () => {
      if (over) return;
      const lagLimit = elapsedTicks() - MAX_LAG_TICKS;
      let changed = false;
      for (const seat of [0, 1] as const) {
        if (!done[seat] && !frozen[seat] && upTo[seat] < lagLimit && upTo[seat] < SNAKE.VERSUS_TICKS) {
          frozen[seat] = true;
          done[seat] = true;
          changed = true;
        }
      }
      if (changed) ctx.broadcast(wire());
      if (done[0] && done[1]) finish();
    };

    ctx.setTimer(finish, Math.max(0, endsAt - ctx.now()) + FINAL_GRACE_MS);
    ctx.setRepeat(freezeIfLagging, 1000);

    return {
      snapshot: wire,
      resume: (seat): SnakeResume => ({ inputs: logs[seat], upTo: upTo[seat], frozen: frozen[seat] }),
      action(seat, type, data) {
        if (over) return { ok: false, error: "GAME_OVER" };
        if (type !== "inputs") return { ok: false, error: "UNKNOWN_ACTION" };
        if (frozen[seat]) return { ok: false, error: "FROZEN" };
        if (done[seat]) return { ok: false, error: "ALREADY_DONE" };
        const d = data as { inputs?: unknown; upTo?: unknown; done?: unknown } | null;
        if (!d || typeof d.upTo !== "number" || !Number.isInteger(d.upTo)) return { ok: false, error: "BAD_UPTO" };
        const limit = Math.min(SNAKE.VERSUS_TICKS, elapsedTicks() + SLACK_TICKS);
        if (d.upTo < upTo[seat] || d.upTo > limit) return { ok: false, error: "UPTO_OUT_OF_RANGE" };
        const check = validateSnakeInputs(d.inputs, d.upTo);
        if (!check.ok) return { ok: false, error: check.error };
        const fresh = d.inputs as SnakeInput[];
        if (fresh.length > 0 && fresh[0]!.tick <= upTo[seat]) return { ok: false, error: "REWRITE_PAST" };
        if (logs[seat].length + fresh.length > SNAKE.VERSUS_TICKS) return { ok: false, error: "TOO_MANY_INPUTS" };
        logs[seat].push(...fresh.map((i) => ({ tick: i.tick, dir: i.dir })));
        upTo[seat] = d.upTo;
        // 증분 시뮬레이션: 매번 0틱부터 다시 돌리지 않는다
        sims[seat] = advanceSnake(sims[seat], logs[seat], upTo[seat]);
        if (sims[seat].dead || (d.done === true && sims[seat].tick >= SNAKE.VERSUS_TICKS)) done[seat] = true;
        ctx.broadcast(wire());
        if (done[0] && done[1]) finish();
        return { ok: true };
      },
    };
  },
};
