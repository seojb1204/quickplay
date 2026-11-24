import { describe, expect, it } from "vitest";
import {
  GOMOKU_SIZE,
  applyGomokuMove,
  chooseGomokuMove,
  createGomoku,
  type GomokuState,
} from "./gomoku.js";
import { PADDLE, createPaddle, stepPaddle, type PaddleState } from "./paddle.js";
import { SNAKE, compareSnake, createSnake, simulateSnake, stepSnake, validateSnakeInputs } from "./snake.js";
import { createRng } from "../rng.js";
import { GAMES } from "../catalog.js";

const idx = (x: number, y: number) => y * GOMOKU_SIZE + x;

function play(moves: Array<[number, number]>): GomokuState {
  let s = createGomoku();
  for (const [x, y] of moves) {
    const r = applyGomokuMove(s, s.turn, idx(x, y));
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  return s;
}

describe("카탈로그", () => {
  it("게임 20종, id 중복 없음", () => {
    expect(GAMES).toHaveLength(20);
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(20);
  });
});

describe("시드 난수", () => {
  it("같은 시드는 같은 수열", () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it("상태로 복원하면 이어서 같은 수열", () => {
    const a = createRng(7);
    a.next();
    const b = createRng(a.state());
    expect(b.next()).toBe(a.next());
  });
});

describe("오목", () => {
  it("가로 5목 승리", () => {
    // 흑: (0..4,0), 백: (0..3,1)
    const s = play([[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1], [3, 0], [3, 1], [4, 0]]);
    expect(s.winner).toBe(0);
    expect(s.winLine).toEqual([0, 1, 2, 3, 4].map((x) => idx(x, 0)));
  });
  it("대각선(↘·↗) 5목 승리", () => {
    const d1 = play([[0, 0], [9, 9], [1, 1], [9, 10], [2, 2], [9, 11], [3, 3], [9, 12], [4, 4]]);
    expect(d1.winner).toBe(0);
    const d2 = play([[14, 14], [0, 4], [14, 13], [1, 3], [14, 12], [2, 2], [13, 14], [3, 1], [12, 14], [4, 0]]);
    expect(d2.winner).toBe(1);
  });
  it("4목은 승리 아님, 6목(장목)은 자유룰이라 승리", () => {
    const four = play([[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1], [3, 0]]);
    expect(four.winner).toBeNull();
    // 흑 0,1,2,4,5 놓고 3을 채워 6목
    const six = play([[0, 0], [0, 5], [1, 0], [1, 5], [2, 0], [2, 5], [4, 0], [3, 5], [5, 0], [9, 9], [3, 0]]);
    expect(six.winner).toBe(0);
  });
  it("차례 위반·중복 착수·범위 밖·종료 후 착수 거부", () => {
    const s = createGomoku();
    expect(applyGomokuMove(s, 1, 0)).toEqual({ ok: false, error: "NOT_YOUR_TURN" });
    const r = applyGomokuMove(s, 0, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(applyGomokuMove(r.state, 1, 0)).toEqual({ ok: false, error: "OCCUPIED" });
    expect(applyGomokuMove(r.state, 1, -1)).toEqual({ ok: false, error: "OUT_OF_RANGE" });
    expect(applyGomokuMove(r.state, 1, 225)).toEqual({ ok: false, error: "OUT_OF_RANGE" });
    expect(applyGomokuMove(r.state, 1, 1.5)).toEqual({ ok: false, error: "OUT_OF_RANGE" });
    const won = play([[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1], [3, 0], [3, 1], [4, 0]]);
    expect(applyGomokuMove(won, 1, idx(9, 9))).toEqual({ ok: false, error: "GAME_OVER" });
  });
  it("판이 가득 차면 무승부", () => {
    // 5목이 생기지 않는 배치: 열 x 를 (x+2y)%4 패턴으로 흑백 교대 — 직접 채우기
    let s = createGomoku();
    const order: number[] = [];
    const black: number[] = [];
    const white: number[] = [];
    for (let y = 0; y < GOMOKU_SIZE; y++) {
      for (let x = 0; x < GOMOKU_SIZE; x++) {
        const c = Math.floor((x + 2 * y) / 2) % 2; // 2칸씩 줄무늬, 행마다 밀림
        (c === 0 ? black : white).push(idx(x, y));
      }
    }
    // 이 줄무늬 배치는 5목이 없고 흑 113 / 백 112 개 (사전 검증한 패턴)
    expect(black).toHaveLength(113);
    expect(white).toHaveLength(112);
    for (let i = 0; i < white.length; i++) order.push(black[i]!, white[i]!);
    order.push(black[112]!);
    for (const m of order) {
      const r = applyGomokuMove(s, s.turn, m);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
      expect(s.winner).toBeNull();
    }
    expect(s.moves).toHaveLength(225);
    expect(s.draw).toBe(true);
    expect(applyGomokuMove(s, s.turn, 0)).toEqual({ ok: false, error: "GAME_OVER" });
  });
  it("AI: 열린 4를 보면 반드시 막거나 이긴다", () => {
    // 흑 4개 연속(1..4,7), 백 차례 → 백은 (0,7) 또는 (5,7)을 막아야 함
    const s = play([[1, 7], [10, 10], [2, 7], [10, 12], [3, 7], [12, 10], [4, 7]]);
    for (const level of ["easy", "normal", "hard"] as const) {
      // easy 도 0.7 확률 이상으로 막음 → random 을 0 으로 고정
      const m = chooseGomokuMove(s, level, () => 0);
      expect([idx(0, 7), idx(5, 7)]).toContain(m);
    }
  });
  it("AI 는 항상 빈칸에 둔다", () => {
    let s = createGomoku();
    const rnd = createRng(1);
    for (let i = 0; i < 60 && s.winner === null; i++) {
      const m = chooseGomokuMove(s, "normal", rnd.next);
      const r = applyGomokuMove(s, s.turn, m);
      expect(r.ok).toBe(true);
      if (r.ok) s = r.state;
    }
  });
});

describe("패들 랠리", () => {
  function run(s: PaddleState, ticks: number, inputs: [-1 | 0 | 1, -1 | 0 | 1] = [0, 0]) {
    for (let i = 0; i < ticks; i++) s = stepPaddle(s, inputs);
    return s;
  }
  it("같은 시드·입력이면 같은 결과(결정성)", () => {
    const a = run(createPaddle(123), 2000, [1, -1]);
    const b = run(createPaddle(123), 2000, [1, -1]);
    expect(a).toEqual(b);
  });
  it("패들은 화면 밖으로 나가지 않는다", () => {
    const s = run(createPaddle(1), 300, [-1, 1]);
    expect(s.paddles[0]).toBe(PADDLE.PADDLE_H / 2);
    expect(s.paddles[1]).toBe(PADDLE.H - PADDLE.PADDLE_H / 2);
  });
  it("공을 받으면 반사되고 속도가 빨라진다", () => {
    let s = createPaddle(5);
    s = { ...s, serveWait: 0, ball: { x: 100, y: 250, vx: -360, vy: 0 }, paddles: [250, 250] };
    let bounced = false;
    for (let i = 0; i < 60; i++) {
      s = stepPaddle(s, [0, 0]);
      if (s.ball.vx > 0) {
        bounced = true;
        break;
      }
    }
    expect(bounced).toBe(true);
    expect(Math.hypot(s.ball.vx, s.ball.vy)).toBeGreaterThan(360);
    expect(s.score).toEqual([0, 0]);
  });
  it("매우 빠른 공도 패들을 관통하지 않는다", () => {
    let s = createPaddle(5);
    s = { ...s, serveWait: 0, ball: { x: 60, y: 250, vx: -PADDLE.BALL_MAX, vy: 0 }, paddles: [250, 250] };
    s = run(s, 10);
    expect(s.score).toEqual([0, 0]);
    expect(s.ball.vx).toBeGreaterThan(0);
  });
  it("패들이 없으면 실점, 5점 먼저 내면 승리", () => {
    let s = createPaddle(9);
    // 왼쪽 패들을 맨 위에 두고 공을 아래로 보내 실점 유도
    for (let n = 0; n < 5; n++) {
      s = { ...s, serveWait: 0, ball: { x: 200, y: 450, vx: -500, vy: 0 }, paddles: [PADDLE.PADDLE_H / 2, s.paddles[1]] };
      s = run(s, 60, [-1, 0]);
    }
    expect(s.score[1]).toBe(5);
    expect(s.over).toBe(true);
    expect(s.winner).toBe(1);
  });
  it("시간 제한 도달 시 동점이면 무승부", () => {
    let s = createPaddle(3);
    s = { ...s, tick: PADDLE.TIME_LIMIT_S * PADDLE.TICK_HZ - 1, serveWait: 10 };
    s = stepPaddle(s, [0, 0]);
    expect(s.over).toBe(true);
    expect(s.winner).toBeNull();
  });
});

describe("꼬리잡기 뱀", () => {
  it("벽에 닿으면 죽는다", () => {
    const s = simulateSnake(1, [], 100);
    expect(s.dead).toBe(true);
    // 머리 x=10 에서 오른쪽으로 → 10틱째에 x=20(벽)
    expect(s.tick).toBe(10);
  });
  it("정반대 방향 전환은 무시", () => {
    const s0 = createSnake(1);
    const s1 = stepSnake(s0, "L");
    expect(s1.dir).toBe("R");
  });
  it("같은 시드 + 같은 입력 → 같은 점수(리플레이 일치)", () => {
    // 먹이를 따라가는 간단한 봇으로 입력 기록 생성
    const seed = 777;
    let s = createSnake(seed);
    const inputs: { tick: number; dir: "U" | "D" | "L" | "R" }[] = [];
    while (!s.dead && s.tick < SNAKE.VERSUS_TICKS) {
      const hx = s.body[0]! % SNAKE.SIZE;
      const hy = Math.floor(s.body[0]! / SNAKE.SIZE);
      const fx = s.food % SNAKE.SIZE;
      const fy = Math.floor(s.food / SNAKE.SIZE);
      let want: "U" | "D" | "L" | "R" = s.dir;
      if (fx > hx) want = "R";
      else if (fx < hx) want = "L";
      else if (fy > hy) want = "D";
      else if (fy < hy) want = "U";
      let turn: typeof want | undefined;
      if (want !== s.dir) {
        const t = stepSnake(s, want);
        if (t.dir === want) {
          turn = want;
          inputs.push({ tick: s.tick + 1, dir: want });
        }
      }
      s = stepSnake(s, turn);
    }
    expect(s.score).toBeGreaterThan(0);
    const replay = simulateSnake(seed, inputs, SNAKE.VERSUS_TICKS);
    expect(replay.score).toBe(s.score);
    expect(replay.tick).toBe(s.tick);
    expect(replay.lastScoreTick).toBe(s.lastScoreTick);
  });
  it("입력 기록 검증: 순서·범위·값", () => {
    expect(validateSnakeInputs([{ tick: 1, dir: "U" }, { tick: 3, dir: "L" }], 10).ok).toBe(true);
    expect(validateSnakeInputs([{ tick: 3, dir: "U" }, { tick: 3, dir: "L" }], 10).ok).toBe(false);
    expect(validateSnakeInputs([{ tick: 11, dir: "U" }], 10).ok).toBe(false);
    expect(validateSnakeInputs([{ tick: 0, dir: "U" }], 10).ok).toBe(false);
    expect(validateSnakeInputs([{ tick: 1, dir: "X" }], 10).ok).toBe(false);
    expect(validateSnakeInputs("nope", 10).ok).toBe(false);
  });
  it("동점 처리: 먼저 도달한 쪽 승, 0점끼리는 무승부", () => {
    expect(compareSnake({ score: 3, lastScoreTick: 100 }, { score: 2, lastScoreTick: 50 })).toBe(1);
    expect(compareSnake({ score: 3, lastScoreTick: 100 }, { score: 3, lastScoreTick: 90 })).toBe(-1);
    expect(compareSnake({ score: 3, lastScoreTick: 90 }, { score: 3, lastScoreTick: 90 })).toBe(0);
    expect(compareSnake({ score: 0, lastScoreTick: 0 }, { score: 0, lastScoreTick: 0 })).toBe(0);
  });
});
