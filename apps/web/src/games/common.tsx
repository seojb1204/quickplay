import { useEffect, useRef, type ReactNode } from "react";

export type Level = "easy" | "normal" | "hard";

export function LevelPicker({ value, onChange }: { value: Level; onChange(l: Level): void }) {
  const items: Array<[Level, string]> = [
    ["easy", "쉬움"],
    ["normal", "보통"],
    ["hard", "어려움"],
  ];
  return (
    <div className="seg" role="radiogroup" aria-label="난이도">
      {items.map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** 키 입력을 ref 에 담는다(게임 루프에서 읽기). 입력 중 페이지 스크롤 방지 */
export function useKeys(keys: string[]) {
  const pressed = useRef(new Set<string>());
  useEffect(() => {
    const set = new Set(keys);
    const down = (e: KeyboardEvent) => {
      if (!set.has(e.key)) return;
      e.preventDefault();
      pressed.current.add(e.key);
    };
    const up = (e: KeyboardEvent) => pressed.current.delete(e.key);
    const blur = () => pressed.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [keys]);
  return pressed;
}

/** 캔버스를 부모 너비에 맞추고 고해상도 화면에서 선명하게 그린다 */
export function setupCanvas(canvas: HTMLCanvasElement, logicalW: number, logicalH: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = logicalW * dpr;
  canvas.height = logicalH * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** 게임 화면이 나타나면 화면 맨 위로 스크롤 — 모바일에서 판이 화면 아래에 숨지 않도록 */
export function PlayArea({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);
  return (
    <div className="play-area" ref={ref}>
      {children}
    </div>
  );
}
