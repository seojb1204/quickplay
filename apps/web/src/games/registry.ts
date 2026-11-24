/** 게임 id → 화면 컴포넌트. 새 게임은 여기와 서버 games/registry.ts 에 등록한다. */
import { lazy } from "react";
import type { GameUi } from "./types";

export const gameUis: Record<string, GameUi> = {
  paddle: {
    Solo: lazy(() => import("./paddle/PaddleSolo")),
    Versus: lazy(() => import("./paddle/PaddleVersus")),
    controls: "키보드 ↑↓ 또는 W/S · 모바일은 화면을 누르고 끌거나 ▲▼ 버튼",
  },
  gomoku: {
    Solo: lazy(() => import("./gomoku/GomokuSolo")),
    Versus: lazy(() => import("./gomoku/GomokuVersus")),
    controls: "칸을 눌러 돌 놓기 · 한 수 30초",
  },
  snake: {
    Solo: lazy(() => import("./snake/SnakeSolo")),
    Versus: lazy(() => import("./snake/SnakeVersus")),
    controls: "방향키 또는 WASD · 모바일은 밀기(스와이프)나 방향 버튼",
  },
};
