/**
 * 게임 카탈로그 — 20종 전체.
 * 상표 위험이 있는 원래 이름(Pong, Tetris, Battleship, Connect Four 등)은 쓰지 않고 자체 명칭을 쓴다.
 * status 'ready' 인 게임만 실제 플레이 가능하다.
 */
export type GameKind = "realtime" | "turn" | "record";
export type GameStatus = "ready" | "soon";

export interface GameMeta {
  id: string;
  name: string;
  /** 전통 규칙 참고명 (내부 문서용, 화면에는 표시하지 않음) */
  reference: string;
  genre: "아케이드" | "퍼즐" | "보드" | "반응속도" | "단어";
  minutes: string;
  kind: GameKind;
  status: GameStatus;
  summary: string;
  /** 정렬·색상용 */
  color: string;
  emoji: string;
}

export const GAME_KIND_LABEL: Record<GameKind, string> = {
  realtime: "실시간 대결",
  turn: "턴제 대결",
  record: "기록 경쟁",
};

export const GAMES: GameMeta[] = [
  { id: "paddle", name: "패들 랠리", reference: "Pong", genre: "아케이드", minutes: "2~3분", kind: "realtime", status: "ready", summary: "패들로 공을 받아쳐 먼저 5점 내기", color: "#4f7cff", emoji: "🏓" },
  { id: "snake", name: "꼬리잡기 뱀", reference: "Snake", genre: "아케이드", minutes: "1~2분", kind: "record", status: "ready", summary: "먹이를 먹고 길어지며 오래 살아남기", color: "#22a06b", emoji: "🐍" },
  { id: "bricks", name: "벽돌 부수기", reference: "Breakout", genre: "아케이드", minutes: "2~4분", kind: "record", status: "soon", summary: "공을 튕겨 벽돌을 모두 제거", color: "#e5484d", emoji: "🧱" },
  { id: "blocks", name: "블록 낙하", reference: "Falling block puzzle", genre: "퍼즐", minutes: "2~5분", kind: "record", status: "soon", summary: "떨어지는 블록으로 줄을 채워 지우기", color: "#8e4ec6", emoji: "🟪" },
  { id: "invaders", name: "우주 방어전", reference: "Fixed shooter", genre: "아케이드", minutes: "2~4분", kind: "record", status: "soon", summary: "내려오는 적 편대를 격추", color: "#f76b15", emoji: "👾" },
  { id: "rocks", name: "소행성 지대", reference: "Asteroids", genre: "아케이드", minutes: "2~4분", kind: "record", status: "soon", summary: "우주선으로 소행성을 피하고 파괴", color: "#6e56cf", emoji: "☄️" },
  { id: "crossing", name: "길 건너기", reference: "Frogger", genre: "아케이드", minutes: "1~3분", kind: "record", status: "soon", summary: "차와 강을 피해 목표 지점 도착", color: "#30a46c", emoji: "🐸" },
  { id: "bombmaze", name: "폭탄 미로", reference: "Bomberman-like", genre: "아케이드", minutes: "2~3분", kind: "realtime", status: "soon", summary: "폭탄으로 벽을 부수고 상대를 잡기", color: "#e54666", emoji: "💣" },
  { id: "tanks", name: "탱크 결투", reference: "Tank battle", genre: "아케이드", minutes: "2~3분", kind: "realtime", status: "soon", summary: "탱크를 몰고 포탄으로 상대 격파", color: "#978365", emoji: "🛡️" },
  { id: "mole", name: "두더지 탭", reference: "Whac-A-Mole", genre: "반응속도", minutes: "1분", kind: "record", status: "soon", summary: "튀어나오는 두더지를 빠르게 탭", color: "#a18072", emoji: "🔨" },
  { id: "gomoku", name: "오목", reference: "Gomoku", genre: "보드", minutes: "3~10분", kind: "turn", status: "ready", summary: "먼저 다섯 개를 한 줄로 놓기", color: "#ad7f58", emoji: "⚫" },
  { id: "tictactoe", name: "삼목", reference: "Tic-tac-toe", genre: "보드", minutes: "1분", kind: "turn", status: "soon", summary: "3×3 칸에서 세 개 연결", color: "#0090ff", emoji: "❌" },
  { id: "fourline", name: "사목 떨구기", reference: "Connect Four", genre: "보드", minutes: "2~5분", kind: "turn", status: "soon", summary: "말을 떨어뜨려 네 개 연결", color: "#ffc53d", emoji: "🟡" },
  { id: "reversi", name: "리버시", reference: "Reversi", genre: "보드", minutes: "5~10분", kind: "turn", status: "soon", summary: "상대 말을 감싸 뒤집어 점령", color: "#29a383", emoji: "⚪" },
  { id: "checkers", name: "체커", reference: "Checkers", genre: "보드", minutes: "5~15분", kind: "turn", status: "soon", summary: "대각선으로 이동하며 상대 말 포획", color: "#ce2c31", emoji: "🔴" },
  { id: "fleet", name: "함대 포격전", reference: "Battleship", genre: "보드", minutes: "5~10분", kind: "turn", status: "soon", summary: "숨겨진 함선 위치를 추리해 포격", color: "#3e63dd", emoji: "🚢" },
  { id: "mines", name: "지뢰 탐색", reference: "Minesweeper", genre: "퍼즐", minutes: "1~5분", kind: "record", status: "soon", summary: "숫자 힌트로 지뢰를 피해 칸 열기", color: "#687076", emoji: "💥" },
  { id: "merge2048", name: "숫자 합치기", reference: "2048", genre: "퍼즐", minutes: "3~10분", kind: "record", status: "soon", summary: "같은 숫자 타일을 합쳐 큰 수 만들기", color: "#f5a623", emoji: "🔢" },
  { id: "memory", name: "카드 짝맞추기", reference: "Concentration", genre: "퍼즐", minutes: "1~3분", kind: "record", status: "soon", summary: "뒤집힌 카드 위치를 기억해 짝 찾기", color: "#d6409f", emoji: "🃏" },
  { id: "hangman", name: "단어 맞히기", reference: "Hangman", genre: "단어", minutes: "1~3분", kind: "record", status: "soon", summary: "제한된 오답 안에 숨은 단어 맞히기", color: "#5b5bd6", emoji: "🔤" },
];

export function getGame(id: string): GameMeta | undefined {
  return GAMES.find((g) => g.id === id);
}

export function isPlayable(id: string): boolean {
  return getGame(id)?.status === "ready";
}
