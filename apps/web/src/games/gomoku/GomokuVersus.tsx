import { useEffect, useState } from "react";
import { createGomoku } from "@qp/shared";
import { sendActionAck, useLive } from "../../lib/live";
import { GomokuBoard } from "./Board";
import type { VersusProps } from "../types";
import { PlayArea } from "../common";

interface Wire {
  board: number[];
  turn: 0 | 1;
  lastMove: number | null;
  winLine: number[] | null;
  turnDeadline: number;
}

export default function GomokuVersus({ seat, opponent, serverNow }: VersusProps) {
  const live = useLive();
  const st = (live.state as Wire | null) ?? { ...createGomoku(), lastMove: null, turnDeadline: 0 };
  const [msg, setMsg] = useState<string | null>(null);
  const [left, setLeft] = useState(30);
  const mine = st.turn === seat;

  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((st.turnDeadline - serverNow()) / 1000))), 250);
    return () => clearInterval(t);
  }, [st.turnDeadline, serverNow]);

  return (
    <PlayArea>
      <div className="hud">
        <span className={mine ? "turn-me" : ""} data-testid="gomoku-turn">
          {mine ? "내 차례" : `${opponent} 차례`} · {seat === 0 ? "나: 흑" : "나: 백"}
        </span>
        <span className={left <= 5 ? "danger" : "muted"}>⏱ {left}초</span>
      </div>
      <GomokuBoard
        board={st.board}
        lastMove={st.lastMove}
        winLine={st.winLine}
        disabled={!mine}
        onPlace={async (i) => {
          const r = await sendActionAck("move", { index: i });
          setMsg(r.ok ? null : "둘 수 없는 자리예요");
        }}
      />
      {msg && <p className="danger small">{msg}</p>}
    </PlayArea>
  );
}
