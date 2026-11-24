/** 서버에서 대전을 지원하는 게임 모듈 등록부. 새 게임은 여기에 한 줄 추가한다. */
import { gomokuModule } from "./gomoku.js";
import { paddleModule } from "./paddle.js";
import { snakeModule } from "./snake.js";
import type { ServerGameModule } from "./types.js";

const modules: ServerGameModule[] = [paddleModule, gomokuModule, snakeModule];

export const serverGames = new Map(modules.map((m) => [m.id, m]));
