import { useState } from "react";
import { SNAKE, randomSeed } from "@qp/shared";
import { apiPost } from "../../lib/api";
import { SnakeGame } from "./SnakeGame";
import { PlayArea } from "../common";

type Phase =
  | { k: "ready" }
  | { k: "playing"; seed: number; sessionId: string | null; startAt: number; score: number }
  | { k: "done"; score: number; best: number | null; verified: boolean };

export default function SnakeSolo() {
  const [p, setP] = useState<Phase>({ k: "ready" });
  const [err, setErr] = useState<string | null>(null);

  const start = async () => {
    setErr(null);
    try {
      const r = await apiPost<{ sessionId: string; seed: number }>("/api/solo/start", { gameId: "snake" });
      setP({ k: "playing", seed: r.seed, sessionId: r.sessionId, startAt: Date.now() + 1500, score: 0 });
    } catch {
      // 서버에 닿지 않으면 연습 모드(기록 저장 안 됨)
      setErr("서버에 연결되지 않아 기록이 저장되지 않는 연습 모드로 시작합니다.");
      setP({ k: "playing", seed: randomSeed(), sessionId: null, startAt: Date.now() + 1500, score: 0 });
    }
  };

  if (p.k === "ready" || p.k === "done") {
    return (
      <div className="panel center">
        {p.k === "done" ? (
          <>
            <h3 data-testid="snake-solo-score">점수 {p.score}</h3>
            <p className="muted">{p.verified ? `내 최고 기록 ${p.best ?? p.score}` : "기록 미저장(연습)"}</p>
          </>
        ) : (
          <>
            <h3>혼자 최고 기록 도전</h3>
            <p className="muted">먹이를 먹을수록 길어져요. 벽이나 몸에 부딪히면 끝.</p>
          </>
        )}
        {err && <p className="danger small">{err}</p>}
        <button className="btn primary big" onClick={start}>
          {p.k === "done" ? "다시 하기" : "시작"}
        </button>
      </div>
    );
  }

  return (
    <PlayArea>
      <div className="hud">
        <span>점수 {p.score}</span>
        <span className="muted">←↑→↓ / WASD / 밀기</span>
      </div>
      <SnakeGame
        seed={p.seed}
        startAtLocal={p.startAt}
        maxTicks={SNAKE.SOLO_MAX_TICKS}
        onProgress={(s) => setP((cur) => (cur.k === "playing" && cur.score !== s.score ? { ...cur, score: s.score } : cur))}
        onEnd={async (s, inputs) => {
          if (!p.sessionId) {
            setP({ k: "done", score: s.score, best: null, verified: false });
            return;
          }
          try {
            const r = await apiPost<{ score: number; best: number }>("/api/solo/finish", {
              sessionId: p.sessionId,
              inputs,
              endTick: s.tick,
            });
            setP({ k: "done", score: r.score, best: r.best, verified: true });
          } catch (e) {
            setErr(`기록 저장 실패: ${(e as Error).message}`);
            setP({ k: "done", score: s.score, best: null, verified: false });
          }
        }}
      />
    </PlayArea>
  );
}
