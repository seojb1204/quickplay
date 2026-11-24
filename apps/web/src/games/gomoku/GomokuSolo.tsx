import { useEffect, useState } from "react";
import { applyGomokuMove, chooseGomokuMove, createGomoku, type AiLevel, type GomokuState } from "@qp/shared";
import { GomokuBoard } from "./Board";
import { PlayArea, LevelPicker } from "../common";

export default function GomokuSolo() {
  const [level, setLevel] = useState<AiLevel>("normal");
  const [state, setState] = useState<GomokuState>(createGomoku);
  const [started, setStarted] = useState(false);
  const over = state.winner !== null || state.draw;

  // AI 는 백(seat 1)
  useEffect(() => {
    if (!started || over || state.turn !== 1) return;
    const t = setTimeout(() => {
      const r = applyGomokuMove(state, 1, chooseGomokuMove(state, level));
      if (r.ok) setState(r.state);
    }, 350);
    return () => clearTimeout(t);
  }, [state, started, over, level]);

  if (!started) {
    return (
      <div className="panel center">
        <h3>컴퓨터와 오목</h3>
        <p className="muted">당신이 흑(선공)입니다. 다섯 개를 먼저 이으면 승리.</p>
        <LevelPicker value={level} onChange={setLevel} />
        <button className="btn primary big" onClick={() => setStarted(true)}>
          시작
        </button>
      </div>
    );
  }

  return (
    <PlayArea>
      <div className="hud">
        <span>
          {over ? (state.draw ? "무승부" : state.winner === 0 ? "🎉 승리!" : "패배") : state.turn === 0 ? "내 차례 (흑)" : "컴퓨터 생각 중…"}
        </span>
        <span className="muted">{state.moves.length}수</span>
      </div>
      <GomokuBoard
        board={state.board}
        lastMove={state.moves.at(-1) ?? null}
        winLine={state.winLine}
        disabled={over || state.turn !== 0}
        onPlace={(i) => {
          const r = applyGomokuMove(state, 0, i);
          if (r.ok) setState(r.state);
        }}
      />
      {over && (
        <div className="row gap">
          <button className="btn primary" onClick={() => setState(createGomoku())}>
            다시 하기
          </button>
        </div>
      )}
      <p className="muted small">컴퓨터 상대 기록은 이 기기에서만 보이고 랭킹에는 들어가지 않아요.</p>
    </PlayArea>
  );
}
