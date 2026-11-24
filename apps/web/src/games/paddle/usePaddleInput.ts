import { useCallback, useMemo, useRef, type PointerEvent } from "react";
import type { Dir } from "@qp/shared";
import { useKeys } from "../common";
import { touchY } from "./draw";

const KEYS = ["ArrowUp", "ArrowDown", "w", "s", "W", "S"];

/**
 * 키보드(↑↓/W S), 화면 버튼(▲▼ 누르고 있기), 캔버스 터치·드래그(손가락 위치로 패들 이동)를 하나의 방향 값으로 합친다.
 */
export function usePaddleInput() {
  const keys = useKeys(KEYS);
  const hold = useRef<Dir>(0);
  const target = useRef<number | null>(null);

  const read = useCallback(
    (myY: number): Dir => {
      const k = keys.current;
      const up = k.has("ArrowUp") || k.has("w") || k.has("W");
      const down = k.has("ArrowDown") || k.has("s") || k.has("S");
      if (up !== down) return up ? -1 : 1;
      if (hold.current !== 0) return hold.current;
      if (target.current !== null) {
        const d = target.current - myY;
        if (Math.abs(d) > 8) return d > 0 ? 1 : -1;
      }
      return 0;
    },
    [keys],
  );

  // 반환 객체를 고정해 게임 루프 effect 가 리렌더마다 재시작되지 않게 한다
  return useMemo(() => {
  const canvasHandlers = {
    onPointerDown: (e: PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      target.current = touchY(e.currentTarget, e.clientY);
    },
    onPointerMove: (e: PointerEvent<HTMLCanvasElement>) => {
      if (target.current !== null) target.current = touchY(e.currentTarget, e.clientY);
    },
    onPointerUp: () => (target.current = null),
    onPointerCancel: () => (target.current = null),
  };

  const holdHandlers = (d: Dir) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      hold.current = d;
    },
    onPointerUp: () => (hold.current = 0),
    onPointerLeave: () => (hold.current = 0),
    onPointerCancel: () => (hold.current = 0),
  });

  return { read, canvasHandlers, holdHandlers };
  }, [read]);
}
