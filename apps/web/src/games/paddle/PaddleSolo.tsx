import { useEffect, useRef, useState } from "react";
import { PADDLE, createPaddle, paddleAi, randomSeed, stepPaddle, type PaddleState } from "@qp/shared";
import { PlayArea, LevelPicker, setupCanvas, type Level } from "../common";
import { drawPaddle } from "./draw";
import { usePaddleInput } from "./usePaddleInput";

export default function PaddleSolo() {
  const [level, setLevel] = useState<Level>("normal");
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = usePaddleInput();

  useEffect(() => {
    if (run === 0 || !canvas.current) return;
    const ctx = setupCanvas(canvas.current, PADDLE.W, PADDLE.H);
    let state: PaddleState = createPaddle(randomSeed());
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tickMs = 1000 / PADDLE.TICK_HZ;
    const loop = (now: number) => {
      acc += Math.min(250, now - last);
      last = now;
      while (acc >= tickMs && !state.over) {
        state = stepPaddle(state, [input.read(state.paddles[0]), paddleAi(state, 1, level)]);
        acc -= tickMs;
      }
      drawPaddle(ctx, { p: state.paddles, b: [state.ball.x, state.ball.y], s: state.score, w: state.serveWait > 0 }, 0, ["나", "컴퓨터"]);
      if (state.over) {
        setResult(state.winner === 0 ? "🎉 승리!" : state.winner === 1 ? "패배" : "무승부");
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [run, level, input]);

  if (run === 0) {
    return (
      <div className="panel center">
        <h3>컴퓨터와 패들 랠리</h3>
        <p className="muted">왼쪽 노란 패들이 나. 먼저 5점을 내면 승리.</p>
        <LevelPicker value={level} onChange={setLevel} />
        <button className="btn primary big" onClick={() => setRun(1)}>
          시작
        </button>
      </div>
    );
  }
  return (
    <PlayArea>
      <canvas ref={canvas} className="game-canvas paddle-canvas" {...input.canvasHandlers} />
      <div className="touch-pad">
        <button className="pad-btn" aria-label="위로" {...input.holdHandlers(-1)}>
          ▲
        </button>
        <button className="pad-btn" aria-label="아래로" {...input.holdHandlers(1)}>
          ▼
        </button>
      </div>
      {result && (
        <div className="row gap center">
          <strong>{result}</strong>
          <button
            className="btn primary"
            onClick={() => {
              setResult(null);
              setRun((r) => r + 1);
            }}
          >
            다시 하기
          </button>
        </div>
      )}
    </PlayArea>
  );
}
