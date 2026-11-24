/**
 * 패들 랠리(퐁 계열) 물리 엔진 — 고정 틱(60Hz) 결정적 시뮬레이션.
 * 대전: 서버가 이 엔진을 돌리고 상태를 방송한다(서버 권위). 솔로: 브라우저가 돌린다.
 * 규칙: 먼저 5점 승리. 경기 시간 180초가 지나면 점수가 높은 쪽 승, 같으면 무승부.
 */
import { createRng, type Rng } from "../rng.js";

export const PADDLE = {
  W: 800,
  H: 500,
  TICK_HZ: 60,
  PADDLE_W: 12,
  PADDLE_H: 90,
  PADDLE_X: 24,
  PADDLE_SPEED: 420,
  BALL_R: 8,
  BALL_SPEED: 360,
  BALL_MAX: 900,
  SPEEDUP: 1.06,
  WIN_SCORE: 5,
  TIME_LIMIT_S: 180,
  SERVE_DELAY_TICKS: 60,
} as const;

export type Dir = -1 | 0 | 1;

export interface PaddleState {
  tick: number;
  paddles: [number, number]; // 각 패들 중심 y
  ball: { x: number; y: number; vx: number; vy: number };
  score: [number, number];
  serveWait: number;
  over: boolean;
  winner: 0 | 1 | null; // over && winner===null → 무승부
  rngState: number;
}

export function createPaddle(seed: number): PaddleState {
  const s: PaddleState = {
    tick: 0,
    paddles: [PADDLE.H / 2, PADDLE.H / 2],
    ball: { x: PADDLE.W / 2, y: PADDLE.H / 2, vx: 0, vy: 0 },
    score: [0, 0],
    serveWait: PADDLE.SERVE_DELAY_TICKS,
    over: false,
    winner: null,
    rngState: seed >>> 0,
  };
  return s;
}

function serve(s: PaddleState, rng: Rng, toward: 0 | 1) {
  const angle = (rng.next() - 0.5) * (Math.PI / 3); // ±30°
  const dir = toward === 0 ? -1 : 1;
  s.ball = {
    x: PADDLE.W / 2,
    y: PADDLE.H / 2,
    vx: Math.cos(angle) * PADDLE.BALL_SPEED * dir,
    vy: Math.sin(angle) * PADDLE.BALL_SPEED,
  };
}

function clampPaddle(y: number) {
  const half = PADDLE.PADDLE_H / 2;
  return Math.max(half, Math.min(PADDLE.H - half, y));
}

/** 한 틱 진행. inputs[seat] = -1(위) 0 1(아래). 새 상태를 반환(입력 상태는 바꾸지 않음). */
export function stepPaddle(prev: PaddleState, inputs: [Dir, Dir]): PaddleState {
  if (prev.over) return prev;
  const s: PaddleState = {
    ...prev,
    paddles: [...prev.paddles] as [number, number],
    ball: { ...prev.ball },
    score: [...prev.score] as [number, number],
  };
  // rng 상태 이어받기: createRng 은 seed 를 내부 상태로 쓰므로 그대로 복원 가능
  const rng = createRng(s.rngState);
  const dt = 1 / PADDLE.TICK_HZ;
  s.tick++;

  for (const seat of [0, 1] as const) {
    s.paddles[seat] = clampPaddle(s.paddles[seat] + inputs[seat] * PADDLE.PADDLE_SPEED * dt);
  }

  if (s.serveWait > 0) {
    s.serveWait--;
    if (s.serveWait === 0) {
      const total = s.score[0] + s.score[1];
      serve(s, rng, (total % 2) as 0 | 1);
    }
  } else {
    const b = s.ball;
    const nx = b.x + b.vx * dt;
    let ny = b.y + b.vy * dt;
    // 위·아래 벽
    if (ny < PADDLE.BALL_R) {
      ny = PADDLE.BALL_R + (PADDLE.BALL_R - ny);
      b.vy = Math.abs(b.vy);
    } else if (ny > PADDLE.H - PADDLE.BALL_R) {
      ny = PADDLE.H - PADDLE.BALL_R - (ny - (PADDLE.H - PADDLE.BALL_R));
      b.vy = -Math.abs(b.vy);
    }
    // 패들 면 통과 여부를 선분으로 검사(빠른 공의 관통 방지)
    const leftFace = PADDLE.PADDLE_X + PADDLE.PADDLE_W / 2 + PADDLE.BALL_R;
    const rightFace = PADDLE.W - PADDLE.PADDLE_X - PADDLE.PADDLE_W / 2 - PADDLE.BALL_R;
    let hit: 0 | 1 | null = null;
    if (b.vx < 0 && b.x >= leftFace && nx < leftFace) hit = 0;
    if (b.vx > 0 && b.x <= rightFace && nx > rightFace) hit = 1;
    if (hit !== null) {
      const face = hit === 0 ? leftFace : rightFace;
      const t = (face - b.x) / (nx - b.x);
      const yAt = b.y + (ny - b.y) * t;
      const py = s.paddles[hit];
      const reach = PADDLE.PADDLE_H / 2 + PADDLE.BALL_R;
      if (Math.abs(yAt - py) <= reach) {
        const rel = (yAt - py) / reach; // -1..1
        const speed = Math.min(Math.hypot(b.vx, b.vy) * PADDLE.SPEEDUP, PADDLE.BALL_MAX);
        const angle = rel * (Math.PI / 3.2);
        const dir = hit === 0 ? 1 : -1;
        b.vx = Math.cos(angle) * speed * dir;
        b.vy = Math.sin(angle) * speed;
        b.x = face;
        b.y = yAt;
      } else {
        b.x = nx;
        b.y = ny;
      }
    } else {
      b.x = nx;
      b.y = ny;
    }
    // 득점
    if (b.x < -PADDLE.BALL_R || b.x > PADDLE.W + PADDLE.BALL_R) {
      const scorer: 0 | 1 = b.x < 0 ? 1 : 0;
      s.score[scorer]++;
      s.ball = { x: PADDLE.W / 2, y: PADDLE.H / 2, vx: 0, vy: 0 };
      s.serveWait = PADDLE.SERVE_DELAY_TICKS;
      if (s.score[scorer] >= PADDLE.WIN_SCORE) {
        s.over = true;
        s.winner = scorer;
      }
    }
  }

  if (!s.over && s.tick >= PADDLE.TIME_LIMIT_S * PADDLE.TICK_HZ) {
    s.over = true;
    s.winner = s.score[0] === s.score[1] ? null : s.score[0] > s.score[1] ? 0 : 1;
  }
  s.rngState = rng.state();
  return s;
}

/** 솔로용 AI: 공을 따라가되 반응 범위·속도를 난이도로 제한 */
export function paddleAi(s: PaddleState, seat: 0 | 1, level: "easy" | "normal" | "hard"): Dir {
  const deadZone = level === "easy" ? 40 : level === "normal" ? 22 : 10;
  const comingToward = seat === 1 ? s.ball.vx > 0 : s.ball.vx < 0;
  const target = comingToward ? s.ball.y : PADDLE.H / 2;
  // easy 는 공이 자기 쪽 절반에 왔을 때만 반응
  if (level === "easy" && comingToward) {
    const inHalf = seat === 1 ? s.ball.x > PADDLE.W * 0.45 : s.ball.x < PADDLE.W * 0.55;
    if (!inHalf) return 0;
  }
  const diff = target - s.paddles[seat];
  if (Math.abs(diff) < deadZone) return 0;
  return diff > 0 ? 1 : -1;
}
