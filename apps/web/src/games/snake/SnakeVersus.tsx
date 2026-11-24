import { useEffect, useRef, useState } from "react";
import { SNAKE, type SnakeInput, type SnakeState } from "@qp/shared";
import { getLive, sendAction, useLive } from "../../lib/live";
import type { VersusProps } from "../types";
import { SnakeGame } from "./SnakeGame";
import { PlayArea } from "../common";

interface Wire {
  scores: [number, number];
  dead: [boolean, boolean];
  ticks: [number, number];
  endsAt: number;
}

/**
 * 두 사람이 같은 시드로 각자 플레이. 1초마다 새 입력을 서버로 보내고, 서버가 재생한 점수를 양쪽에 보여준다.
 */
export default function SnakeVersus({ seat, seed, startAt, opponent, serverNow }: VersusProps) {
  const live = useLive();
  const wire = live.state as Wire | null;
  const sentCount = useRef(0);
  const lastFlush = useRef(0);
  const finished = useRef(false);
  const [myScore, setMyScore] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [left, setLeft] = useState(90);
  const opp: 0 | 1 = seat === 0 ? 1 : 0;

  const flush = (s: SnakeState, inputs: SnakeInput[], done: boolean) => {
    const fresh = inputs.slice(sentCount.current);
    sentCount.current = inputs.length;
    lastFlush.current = Date.now();
    sendAction("inputs", { inputs: fresh, upTo: s.tick, done });
  };

  useEffect(() => {
    const t = setInterval(() => {
      const endsAt = wire?.endsAt ?? startAt + SNAKE.VERSUS_TICKS * SNAKE.TICK_MS;
      setLeft(Math.max(0, Math.ceil((endsAt - serverNow()) / 1000)));
    }, 250);
    return () => clearInterval(t);
  }, [wire?.endsAt, startAt, serverNow]);

  const startAtLocal = startAt - getLive().clockOffset;

  return (
    <PlayArea>
      <div className="hud">
        <span data-testid="snake-my-score">나 {myScore}</span>
        <span>⏱ {left}초</span>
        <span data-testid="snake-opp-score">
          {opponent} {wire?.scores[opp] ?? 0}
          {wire?.dead[opp] ? " (종료)" : ""}
        </span>
      </div>
      <SnakeGame
        seed={seed}
        startAtLocal={startAtLocal}
        maxTicks={SNAKE.VERSUS_TICKS}
        onProgress={(s, inputs) => {
          if (s.score !== myScore) setMyScore(s.score);
          if (!finished.current && Date.now() - lastFlush.current > 1000) flush(s, inputs, false);
        }}
        onEnd={(s, inputs) => {
          finished.current = true;
          setWaiting(true);
          flush(s, inputs, true);
        }}
      />
      {waiting && <p className="muted center">상대가 끝날 때까지 기다리는 중…</p>}
    </PlayArea>
  );
}
