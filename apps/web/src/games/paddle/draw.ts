import { PADDLE } from "@qp/shared";

export interface PaddleFrame {
  p: [number, number];
  b: [number, number];
  s: [number, number];
  w: boolean;
}

export function drawPaddle(ctx: CanvasRenderingContext2D, f: PaddleFrame, mySeat: 0 | 1 | null, labels: [string, string]) {
  const { W, H, PADDLE_X, PADDLE_W, PADDLE_H, BALL_R } = PADDLE;
  ctx.fillStyle = "#14183a";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,.18)";
  ctx.setLineDash([10, 14]);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = "bold 56px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,.35)";
  ctx.fillText(String(f.s[0]), W / 2 - 70, 70);
  ctx.fillText(String(f.s[1]), W / 2 + 70, 70);
  ctx.font = "600 18px system-ui, sans-serif";
  ctx.fillText(labels[0], W / 4, H - 18);
  ctx.fillText(labels[1], (3 * W) / 4, H - 18);

  for (const seat of [0, 1] as const) {
    const x = seat === 0 ? PADDLE_X : W - PADDLE_X;
    ctx.fillStyle = mySeat === seat ? "#ffd84d" : "#8fa6ff";
    roundRect(ctx, x - PADDLE_W / 2, f.p[seat] - PADDLE_H / 2, PADDLE_W, PADDLE_H, 6);
  }
  if (!f.w) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(f.b[0], f.b[1], BALL_R, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = "rgba(255,255,255,.6)";
    ctx.font = "600 22px system-ui, sans-serif";
    ctx.fillText("서브 준비", W / 2, H / 2 + 8);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.fill();
}

/** 캔버스 위 터치 위치 → 논리 좌표 y */
export function touchY(canvas: HTMLCanvasElement, clientY: number) {
  const r = canvas.getBoundingClientRect();
  return ((clientY - r.top) / r.height) * PADDLE.H;
}
