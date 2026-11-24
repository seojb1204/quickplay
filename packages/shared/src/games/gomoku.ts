/**
 * 오목 규칙 엔진 (서버·클라이언트 공용, 순수 함수).
 * 규칙: 15×15, 흑(seat 0) 선공, 자유룰 — 같은 색 5개 이상 연속이면 승리. 금수 없음.
 * 판이 가득 차면 무승부. 한 수 제한 시간은 서버가 관리(GOMOKU_TURN_MS).
 */
export const GOMOKU_SIZE = 15;
export const GOMOKU_TURN_MS = 30_000;

export type Seat = 0 | 1;
/** 0 빈칸, 1 흑(seat0), 2 백(seat1) */
export type GomokuCell = 0 | 1 | 2;

export interface GomokuState {
  board: GomokuCell[];
  turn: Seat;
  moves: number[];
  winner: Seat | null;
  draw: boolean;
  winLine: number[] | null;
}

export type MoveResult =
  | { ok: true; state: GomokuState }
  | { ok: false; error: "GAME_OVER" | "NOT_YOUR_TURN" | "OUT_OF_RANGE" | "OCCUPIED" };

export function createGomoku(): GomokuState {
  return {
    board: new Array<GomokuCell>(GOMOKU_SIZE * GOMOKU_SIZE).fill(0),
    turn: 0,
    moves: [],
    winner: null,
    draw: false,
    winLine: null,
  };
}

const DIRS: Array<[number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

function inBounds(x: number, y: number) {
  return x >= 0 && y >= 0 && x < GOMOKU_SIZE && y < GOMOKU_SIZE;
}

/** index 에 놓인 돌이 5목 이상을 만들었는지 확인하고, 만들었으면 그 줄을 반환 */
export function findLine(board: GomokuCell[], index: number): number[] | null {
  const color = board[index];
  if (!color) return null;
  const x0 = index % GOMOKU_SIZE;
  const y0 = Math.floor(index / GOMOKU_SIZE);
  for (const [dx, dy] of DIRS) {
    const line = [index];
    for (const sign of [1, -1]) {
      let x = x0 + dx * sign;
      let y = y0 + dy * sign;
      while (inBounds(x, y) && board[y * GOMOKU_SIZE + x] === color) {
        line.push(y * GOMOKU_SIZE + x);
        x += dx * sign;
        y += dy * sign;
      }
    }
    if (line.length >= 5) return line.sort((a, b) => a - b);
  }
  return null;
}

export function applyGomokuMove(state: GomokuState, seat: Seat, index: number): MoveResult {
  if (state.winner !== null || state.draw) return { ok: false, error: "GAME_OVER" };
  if (seat !== state.turn) return { ok: false, error: "NOT_YOUR_TURN" };
  if (!Number.isInteger(index) || index < 0 || index >= GOMOKU_SIZE * GOMOKU_SIZE) {
    return { ok: false, error: "OUT_OF_RANGE" };
  }
  if (state.board[index] !== 0) return { ok: false, error: "OCCUPIED" };

  const board = state.board.slice();
  board[index] = seat === 0 ? 1 : 2;
  const moves = [...state.moves, index];
  const line = findLine(board, index);
  const winner = line ? seat : null;
  const draw = !line && moves.length === board.length;
  return {
    ok: true,
    state: { board, moves, winner, draw, winLine: line, turn: seat === 0 ? 1 : 0 },
  };
}

// ---------------------------------------------------------------- AI

export type AiLevel = "easy" | "normal" | "hard";

/** 한 방향의 연속 돌 수와 양끝 열림 수 */
function lineInfo(board: GomokuCell[], x0: number, y0: number, dx: number, dy: number, color: GomokuCell) {
  let count = 1;
  let open = 0;
  for (const sign of [1, -1]) {
    let x = x0 + dx * sign;
    let y = y0 + dy * sign;
    while (inBounds(x, y) && board[y * GOMOKU_SIZE + x] === color) {
      count++;
      x += dx * sign;
      y += dy * sign;
    }
    if (inBounds(x, y) && board[y * GOMOKU_SIZE + x] === 0) open++;
  }
  return { count, open };
}

function patternScore(count: number, open: number): number {
  if (count >= 5) return 1_000_000;
  if (open === 0) return 0;
  if (count === 4) return open === 2 ? 100_000 : 10_000;
  if (count === 3) return open === 2 ? 5_000 : 500;
  if (count === 2) return open === 2 ? 200 : 30;
  return open === 2 ? 10 : 2;
}

function cellScore(board: GomokuCell[], index: number, me: GomokuCell, opp: GomokuCell): number {
  const x = index % GOMOKU_SIZE;
  const y = Math.floor(index / GOMOKU_SIZE);
  let attack = 0;
  let defense = 0;
  for (const [dx, dy] of DIRS) {
    const a = lineInfo(board, x, y, dx, dy, me);
    const d = lineInfo(board, x, y, dx, dy, opp);
    attack += patternScore(a.count, a.open);
    defense += patternScore(d.count, d.open);
  }
  // 공격을 약간 우선
  return attack * 1.1 + defense;
}

function candidates(board: GomokuCell[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== 0) continue;
    const x = i % GOMOKU_SIZE;
    const y = Math.floor(i / GOMOKU_SIZE);
    let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) {
      for (let dx = -2; dx <= 2 && !near; dx++) {
        if (inBounds(x + dx, y + dy) && board[(y + dy) * GOMOKU_SIZE + x + dx] !== 0) near = true;
      }
    }
    if (near) out.push(i);
  }
  return out;
}

/** AI 가 둘 칸을 고른다. random 은 0~1 난수 함수 (테스트 재현용으로 주입 가능) */
export function chooseGomokuMove(state: GomokuState, level: AiLevel, random: () => number = Math.random): number {
  const center = Math.floor((GOMOKU_SIZE * GOMOKU_SIZE) / 2);
  if (state.moves.length === 0) return center;
  const me: GomokuCell = state.turn === 0 ? 1 : 2;
  const opp: GomokuCell = me === 1 ? 2 : 1;
  const scored = candidates(state.board)
    .map((i) => ({ i, s: cellScore(state.board, i, me, opp) }))
    .sort((a, b) => b.s - a.s);
  if (scored.length === 0) return state.board.indexOf(0);
  const best = scored[0]!;
  // 즉시 승리·즉시 방어는 모든 난이도에서 놓치지 않되, easy 는 가끔 놓친다
  if (level === "hard") return best.i;
  if (level === "normal") {
    if (best.s >= 10_000) return best.i;
    const top = scored.slice(0, 3);
    return top[Math.floor(random() * top.length)]!.i;
  }
  if (best.s >= 100_000 && random() < 0.7) return best.i;
  const top = scored.slice(0, 6);
  return top[Math.floor(random() * top.length)]!.i;
}
