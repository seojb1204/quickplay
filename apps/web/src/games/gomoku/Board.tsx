import { GOMOKU_SIZE } from "@qp/shared";

interface Props {
  board: number[];
  lastMove: number | null;
  winLine: number[] | null;
  disabled: boolean;
  onPlace(index: number): void;
}

/** 15×15 오목판. 칸 전체가 버튼이라 모바일에서도 누르기 쉽다. */
export function GomokuBoard({ board, lastMove, winLine, disabled, onPlace }: Props) {
  const win = new Set(winLine ?? []);
  return (
    <div className="gomoku" role="grid" aria-label="오목판" style={{ gridTemplateColumns: `repeat(${GOMOKU_SIZE}, 1fr)` }}>
      {board.map((c, i) => (
        <button
          key={i}
          type="button"
          role="gridcell"
          className={`gk-cell${c ? " filled" : ""}`}
          data-index={i}
          aria-label={`${(i % GOMOKU_SIZE) + 1}열 ${Math.floor(i / GOMOKU_SIZE) + 1}행 ${c === 1 ? "흑" : c === 2 ? "백" : "빈칸"}`}
          disabled={disabled || c !== 0}
          onClick={() => onPlace(i)}
        >
          {c !== 0 && <span className={`stone ${c === 1 ? "black" : "white"}${i === lastMove ? " last" : ""}${win.has(i) ? " win" : ""}`} />}
        </button>
      ))}
    </div>
  );
}
