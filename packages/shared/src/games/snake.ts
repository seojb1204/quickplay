/**
 * 꼬리잡기 뱀 — 결정적 틱 시뮬레이션.
 * 같은 시드 + 같은 입력 기록 → 항상 같은 결과. 서버는 클라이언트가 보낸 입력 기록을 다시 돌려
 * 점수를 직접 계산한다(클라이언트가 주장한 점수는 믿지 않음).
 *
 * 규칙: 20×20 격자, 초당 8틱. 벽이나 자기 몸에 닿으면 종료. 먹이 1개 = 1점.
 * 대전(기록 경쟁): 두 사람이 같은 시드로 90초 동안 플레이. 점수 높은 쪽 승.
 *   동점이면 마지막 득점 시각이 빠른 쪽 승, 그것도 같으면 무승부.
 */
import { createRng } from "../rng.js";

export const SNAKE = {
  SIZE: 20,
  TICK_MS: 125,
  VERSUS_TICKS: 720, // 90초
  SOLO_MAX_TICKS: 28_800, // 1시간 상한
} as const;

export type SnakeDir = "U" | "D" | "L" | "R";
export interface SnakeInput {
  tick: number;
  dir: SnakeDir;
}

export interface SnakeState {
  tick: number;
  body: number[]; // [0] = 머리, 칸 인덱스
  dir: SnakeDir;
  food: number;
  score: number;
  lastScoreTick: number;
  dead: boolean;
  rngState: number;
}

const OPPOSITE: Record<SnakeDir, SnakeDir> = { U: "D", D: "U", L: "R", R: "L" };
const DIRS = new Set<string>(["U", "D", "L", "R"]);

/**
 * 먹이 위치: 먹이 1개당 난수 1번만 뽑는다(몸 상태와 무관) → 두 플레이어가 같은 시드면 같은 후보 칸 순서.
 * 후보 칸이 자기 몸에 덮였을 때만 다음 빈칸으로 밀린다.
 */
function placeFood(body: number[], rngState: number): { food: number; rngState: number } {
  const rng = createRng(rngState);
  const total = SNAKE.SIZE * SNAKE.SIZE;
  const candidate = rng.int(total);
  const occupied = new Set(body);
  for (let k = 0; k < total; k++) {
    const c = (candidate + k) % total;
    if (!occupied.has(c)) return { food: c, rngState: rng.state() };
  }
  return { food: -1, rngState: rng.state() };
}

export function createSnake(seed: number): SnakeState {
  const mid = Math.floor(SNAKE.SIZE / 2);
  const head = mid * SNAKE.SIZE + mid;
  const body = [head, head - 1, head - 2];
  const { food, rngState } = placeFood(body, seed >>> 0);
  return { tick: 0, body, dir: "R", food, score: 0, lastScoreTick: 0, dead: false, rngState };
}

/** 방향 전환이 유효한지(정반대 방향 금지) */
export function canTurn(state: SnakeState, dir: SnakeDir): boolean {
  return DIRS.has(dir) && dir !== state.dir && dir !== OPPOSITE[state.dir];
}

/** 한 틱 진행. turn 은 이번 틱 시작에 적용할 방향(없으면 유지). */
export function stepSnake(prev: SnakeState, turn?: SnakeDir): SnakeState {
  if (prev.dead) return prev;
  const dir = turn && canTurn(prev, turn) ? turn : prev.dir;
  const head = prev.body[0]!;
  let x = head % SNAKE.SIZE;
  let y = Math.floor(head / SNAKE.SIZE);
  if (dir === "U") y--;
  else if (dir === "D") y++;
  else if (dir === "L") x--;
  else x++;
  const tick = prev.tick + 1;
  if (x < 0 || y < 0 || x >= SNAKE.SIZE || y >= SNAKE.SIZE) {
    return { ...prev, tick, dir, dead: true };
  }
  const next = y * SNAKE.SIZE + x;
  const eats = next === prev.food;
  // 먹지 않으면 꼬리가 빠지므로 꼬리 칸으로는 이동 가능
  const bodyToCheck = eats ? prev.body : prev.body.slice(0, -1);
  if (bodyToCheck.includes(next)) {
    return { ...prev, tick, dir, dead: true };
  }
  const body = [next, ...bodyToCheck];
  if (!eats) return { ...prev, tick, dir, body };
  const placed = placeFood(body, prev.rngState);
  return {
    ...prev,
    tick,
    dir,
    body,
    score: prev.score + 1,
    lastScoreTick: tick,
    food: placed.food,
    rngState: placed.rngState,
    dead: placed.food === -1 ? true : prev.dead, // 판을 다 채우면 종료(사실상 만점)
  };
}

export type InputCheck = { ok: true } | { ok: false; error: string };

/** 입력 기록 형식 검증: 틱이 1 이상, 순증가, 상한 이내, 방향 값 유효 */
export function validateSnakeInputs(inputs: unknown, maxTick: number): InputCheck {
  if (!Array.isArray(inputs)) return { ok: false, error: "INPUTS_NOT_ARRAY" };
  if (inputs.length > maxTick) return { ok: false, error: "TOO_MANY_INPUTS" };
  let last = 0;
  for (const it of inputs) {
    if (typeof it !== "object" || it === null) return { ok: false, error: "BAD_INPUT" };
    const { tick, dir } = it as Record<string, unknown>;
    if (typeof tick !== "number" || !Number.isInteger(tick)) return { ok: false, error: "BAD_TICK" };
    if (tick <= last || tick > maxTick) return { ok: false, error: "TICK_ORDER" };
    if (typeof dir !== "string" || !DIRS.has(dir)) return { ok: false, error: "BAD_DIR" };
    last = tick;
  }
  return { ok: true };
}

/**
 * 현재 상태에서 이어서 재생(서버 증분 시뮬레이션용). inputs 는 전체 기록, 이미 적용된 틱 이후만 사용.
 */
export function advanceSnake(state: SnakeState, inputs: SnakeInput[], upToTick: number): SnakeState {
  let s = state;
  let i = 0;
  while (i < inputs.length && inputs[i]!.tick <= s.tick) i++;
  while (!s.dead && s.tick < upToTick) {
    const nextTick = s.tick + 1;
    let turn: SnakeDir | undefined;
    while (i < inputs.length && inputs[i]!.tick <= nextTick) {
      if (inputs[i]!.tick === nextTick) turn = inputs[i]!.dir;
      i++;
    }
    s = stepSnake(s, turn);
  }
  return s;
}

/**
 * 입력 기록을 upToTick 까지 재생. 입력 틱 t 는 "t 번째 틱을 계산할 때 적용"을 뜻한다.
 */
export function simulateSnake(seed: number, inputs: SnakeInput[], upToTick: number): SnakeState {
  return advanceSnake(createSnake(seed), inputs, upToTick);
}

/** 대전 결과 비교: 1 = a 승, -1 = b 승, 0 = 무승부 */
export function compareSnake(a: { score: number; lastScoreTick: number }, b: { score: number; lastScoreTick: number }): 1 | -1 | 0 {
  if (a.score !== b.score) return a.score > b.score ? 1 : -1;
  if (a.score === 0) return 0;
  if (a.lastScoreTick !== b.lastScoreTick) return a.lastScoreTick < b.lastScoreTick ? 1 : -1;
  return 0;
}
