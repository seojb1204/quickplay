import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GAMES, GAME_KIND_LABEL, type GameKind } from "@qp/shared";
import { errorText, send, useLive } from "../lib/live";

type Filter = "all" | GameKind;

export default function Home() {
  const nav = useNavigate();
  const live = useLive();
  const [code, setCode] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const games = useMemo(
    () =>
      GAMES.filter((g) => filter === "all" || g.kind === filter).sort(
        (a, b) => Number(b.status === "ready") - Number(a.status === "ready"),
      ),
    [filter],
  );
  const readyCount = GAMES.filter((g) => g.status === "ready").length;

  const createRoom = async () => {
    setBusy(true);
    setErr(null);
    const r = await send<{ code: string }>("room:create", {});
    setBusy(false);
    if (r.ok) nav(`/r/${r.code}`);
    else if (r.error === "ALREADY_IN_ROOM" && live.room) nav(`/r/${live.room.code}`);
    else setErr(errorText(r));
  };

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (c.length !== 6) {
      setErr("방 코드는 6자리예요.");
      return;
    }
    nav(`/r/${c}`);
  };

  return (
    <div className="stack">
      <section className="hero">
        <div>
          <h1>설치 없이, 바로 한 판.</h1>
          <p className="muted">매칭 기다리는 동안, 쉬는 시간에. 혼자 · 친구와 · 랜덤 상대와 1:1.</p>
        </div>
        <div className="hero-actions">
          <button className="btn primary big" onClick={createRoom} disabled={busy || live.status !== "online"} data-testid="create-room">
            👥 친구방 만들기
          </button>
          <form className="join" onSubmit={join}>
            <input
              aria-label="방 코드"
              placeholder="방 코드 6자리"
              value={code}
              maxLength={8}
              autoCapitalize="characters"
              onChange={(e) => setCode(e.target.value)}
              data-testid="join-code"
            />
            <button className="btn" type="submit">
              입장
            </button>
          </form>
          {err && <p className="danger small">{err}</p>}
        </div>
      </section>

      <section>
        <div className="row between wrap gap">
          <h2>
            게임 <span className="muted small">플레이 가능 {readyCount} / {GAMES.length}</span>
          </h2>
          <div className="seg" role="tablist" aria-label="게임 유형">
            {(["all", "realtime", "turn", "record"] as const).map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
                {f === "all" ? "전체" : GAME_KIND_LABEL[f]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid">
          {games.map((g) =>
            g.status === "ready" ? (
              <Link key={g.id} to={`/g/${g.id}`} className="card" style={{ ["--c" as string]: g.color }} data-testid={`game-${g.id}`}>
                <span className="emoji" aria-hidden>
                  {g.emoji}
                </span>
                <strong>{g.name}</strong>
                <span className="muted small">{g.summary}</span>
                <span className="tags">
                  <span className="tag">{GAME_KIND_LABEL[g.kind]}</span>
                  <span className="tag">⏱ {g.minutes}</span>
                </span>
              </Link>
            ) : (
              <div key={g.id} className="card soon" style={{ ["--c" as string]: g.color }} aria-disabled>
                <span className="emoji" aria-hidden>
                  {g.emoji}
                </span>
                <strong>{g.name}</strong>
                <span className="muted small">{g.summary}</span>
                <span className="tags">
                  <span className="tag">준비 중</span>
                </span>
              </div>
            ),
          )}
        </div>
      </section>
    </div>
  );
}
