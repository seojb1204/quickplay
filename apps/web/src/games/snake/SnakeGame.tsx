import { useEffect, useRef, type PointerEvent } from "react";
import { SNAKE, advanceSnake, canTurn, createSnake, stepSnake, type SnakeDir, type SnakeInput, type SnakeState } from "@qp/shared";
import { setupCanvas } from "../common";

const CELL = 24;
const PX = SNAKE.SIZE * CELL;
const KEYMAP: Record<string, SnakeDir> = {
  ArrowUp: "U",
  ArrowDown: "D",
  ArrowLeft: "L",
  ArrowRight: "R",
  w: "U",
  s: "D",
  a: "L",
  d: "R",
  W: "U",
  S: "D",
  A: "L",
  D: "R",
};

export interface SnakeGameProps {
  seed: number;
  /** 로컬 시계 기준 시작 시각(performance.now 아님, Date.now 기준) */
  startAtLocal: number;
  maxTicks: number;
  /** 재접속 시 서버가 이미 받은 입력 기록 — 여기서부터 이어서 플레이 */
  resume?: { inputs: SnakeInput[]; upTo: number };
  onProgress?(s: SnakeState, inputs: SnakeInput[]): void;
  onEnd(s: SnakeState, inputs: SnakeInput[]): void;
}

function draw(ctx: CanvasRenderingContext2D, s: SnakeState, countdown: number) {
  ctx.fillStyle = "#0f2a1f";
  ctx.fillRect(0, 0, PX, PX);
  ctx.fillStyle = "rgba(255,255,255,.04)";
  for (let y = 0; y < SNAKE.SIZE; y++) for (let x = (y % 2); x < SNAKE.SIZE; x += 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
  if (s.food >= 0) {
    ctx.fillStyle = "#ff5d73";
    const fx = (s.food % SNAKE.SIZE) * CELL + CELL / 2;
    const fy = Math.floor(s.food / SNAKE.SIZE) * CELL + CELL / 2;
    ctx.beginPath();
    ctx.arc(fx, fy, CELL * 0.36, 0, Math.PI * 2);
    ctx.fill();
  }
  s.body.forEach((c, i) => {
    ctx.fillStyle = i === 0 ? "#b6f36b" : "#4fd18b";
    const x = (c % SNAKE.SIZE) * CELL;
    const y = Math.floor(c / SNAKE.SIZE) * CELL;
    ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
  });
  if (countdown > 0) {
    ctx.fillStyle = "rgba(0,0,0,.45)";
    ctx.fillRect(0, 0, PX, PX);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 96px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(countdown), PX / 2, PX / 2 + 32);
  }
  if (s.dead) {
    ctx.fillStyle = "rgba(0,0,0,.5)";
    ctx.fillRect(0, 0, PX, PX);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 40px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("게임 종료", PX / 2, PX / 2);
  }
}

/** 결정적 뱀 게임 실행기. 입력은 "적용된 틱"과 함께 기록되어 서버 리플레이와 정확히 일치한다. */
export function SnakeGame({ seed, startAtLocal, maxTicks, resume, onProgress, onEnd }: SnakeGameProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const queue = useRef<SnakeDir[]>([]);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const cbs = useRef({ onProgress, onEnd });
  cbs.current = { onProgress, onEnd };
  const resumeRef = useRef(resume);

  useEffect(() => {
    if (!canvas.current) return;
    const ctx = setupCanvas(canvas.current, PX, PX);
    const r = resumeRef.current;
    const inputs: SnakeInput[] = r ? r.inputs.map((i) => ({ ...i })) : [];
    let s = r ? advanceSnake(createSnake(seed), inputs, r.upTo) : createSnake(seed);
    let raf = 0;
    let ended = false;
    queue.current = [];

    const loop = () => {
      const elapsed = Date.now() - startAtLocal;
      const due = Math.min(maxTicks, Math.floor(elapsed / SNAKE.TICK_MS));
      let changed = false;
      while (!s.dead && s.tick < due) {
        let turn: SnakeDir | undefined;
        // 버퍼에서 유효한 방향 하나 꺼내기 (빠른 연속 입력 대응)
        while (queue.current.length) {
          const d = queue.current.shift()!;
          if (canTurn(s, d)) {
            turn = d;
            break;
          }
        }
        if (turn) inputs.push({ tick: s.tick + 1, dir: turn });
        s = stepSnake(s, turn);
        changed = true;
      }
      draw(ctx, s, elapsed < 0 ? Math.ceil(-elapsed / 1000) : 0);
      if (changed) cbs.current.onProgress?.(s, inputs);
      if (!ended && (s.dead || s.tick >= maxTicks)) {
        ended = true;
        cbs.current.onEnd(s, inputs);
      }
      if (!ended) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const key = (e: KeyboardEvent) => {
      const d = KEYMAP[e.key];
      if (!d) return;
      e.preventDefault();
      if (queue.current.length < 3) queue.current.push(d);
    };
    window.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", key);
    };
  }, [seed, startAtLocal, maxTicks]);

  const push = (d: SnakeDir) => {
    if (queue.current.length < 3) queue.current.push(d);
  };

  const pointer = {
    onPointerDown: (e: PointerEvent) => {
      swipe.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: PointerEvent) => {
      const st = swipe.current;
      swipe.current = null;
      if (!st) return;
      const dx = e.clientX - st.x;
      const dy = e.clientY - st.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
      push(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "R" : "L") : dy > 0 ? "D" : "U");
    },
  };

  return (
    <>
      <canvas ref={canvas} className="game-canvas snake-canvas" data-testid="snake-canvas" {...pointer} />
      <div className="dpad" aria-label="방향 버튼">
        <button className="pad-btn up" aria-label="위" onPointerDown={() => push("U")}>
          ▲
        </button>
        <button className="pad-btn left" aria-label="왼쪽" onPointerDown={() => push("L")}>
          ◀
        </button>
        <button className="pad-btn right" aria-label="오른쪽" onPointerDown={() => push("R")}>
          ▶
        </button>
        <button className="pad-btn down" aria-label="아래" onPointerDown={() => push("D")}>
          ▼
        </button>
      </div>
    </>
  );
}
