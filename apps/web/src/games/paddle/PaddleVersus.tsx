import { useEffect, useRef } from "react";
import { PADDLE, type Dir } from "@qp/shared";
import { getLive, onMatchState, sendAction } from "../../lib/live";
import { PlayArea, setupCanvas } from "../common";
import type { VersusProps } from "../types";
import { drawPaddle, type PaddleFrame } from "./draw";
import { usePaddleInput } from "./usePaddleInput";

interface Wire extends PaddleFrame {
  t: number;
}

/** 서버가 보낸 상태를 그리기만 한다. 두 프레임 사이를 보간해 30Hz 방송도 부드럽게 보이게 한다. */
export default function PaddleVersus({ seat, me, opponent }: VersusProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = usePaddleInput();

  useEffect(() => {
    if (!canvas.current) return;
    const ctx = setupCanvas(canvas.current, PADDLE.W, PADDLE.H);
    let prev: Wire | null = null;
    let cur: Wire | null = (getLive().state as Wire | null) ?? null;
    let curAt = performance.now();
    const off = onMatchState((s) => {
      prev = cur;
      cur = s as Wire;
      curAt = performance.now();
    });
    let sent: Dir = 0;
    let raf = 0;
    const labels: [string, string] = seat === 0 ? [`${me} (나)`, opponent] : [opponent, `${me} (나)`];
    const loop = () => {
      if (cur) {
        const dir = input.read(cur.p[seat]);
        if (dir !== sent) {
          sent = dir;
          sendAction("input", { dir });
        }
        let frame: PaddleFrame = cur;
        if (prev && !cur.w && !prev.w) {
          const k = Math.min(1, (performance.now() - curAt) / 33);
          // 직전 프레임에서 현재 프레임으로 이어서 외삽하지 않고 보간만 한다(튀는 현상 방지)
          frame = {
            ...cur,
            b: [prev.b[0] + (cur.b[0] - prev.b[0]) * k, prev.b[1] + (cur.b[1] - prev.b[1]) * k],
          };
        }
        drawPaddle(ctx, frame, seat, labels);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      off();
      cancelAnimationFrame(raf);
      sendAction("input", { dir: 0 });
    };
  }, [seat, me, opponent, input]);

  return (
    <PlayArea>
      <p className="muted small center">{seat === 0 ? "왼쪽" : "오른쪽"} 노란 패들이 나 · ↑↓ / W S · 화면을 누르고 끌기</p>
      <canvas ref={canvas} className="game-canvas paddle-canvas" data-testid="paddle-canvas" {...input.canvasHandlers} />
      <div className="touch-pad">
        <button className="pad-btn" aria-label="위로" {...input.holdHandlers(-1)}>
          ▲
        </button>
        <button className="pad-btn" aria-label="아래로" {...input.holdHandlers(1)}>
          ▼
        </button>
      </div>
    </PlayArea>
  );
}
