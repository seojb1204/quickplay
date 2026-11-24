import { Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { GAME_KIND_LABEL, QUEUE_HINT_AFTER_MS, getGame } from "@qp/shared";
import { gameUis } from "../games/registry";
import { errorText, send, useLive } from "../lib/live";

type Tab = "solo" | "friend" | "random";

export default function GamePage() {
  const { gameId = "" } = useParams();
  const game = getGame(gameId);
  const ui = gameUis[gameId];
  const [tab, setTab] = useState<Tab | null>(null);

  if (!game || !ui || game.status !== "ready") {
    return (
      <div className="panel center">
        <h2>{game ? `${game.name}은(는) 준비 중이에요` : "없는 게임이에요"}</h2>
        <Link className="btn" to="/">
          다른 게임 고르기
        </Link>
      </div>
    );
  }

  const Solo = ui.Solo;
  return (
    <div className="stack">
      <div className="game-head" style={{ ["--c" as string]: game.color }}>
        <span className="emoji big" aria-hidden>
          {game.emoji}
        </span>
        <div>
          <h1>{game.name}</h1>
          <p className="muted">
            {game.summary} · {GAME_KIND_LABEL[game.kind]} · ⏱ {game.minutes}
          </p>
          <p className="muted small">조작: {ui.controls}</p>
        </div>
      </div>

      <div className="modes" role="tablist" aria-label="플레이 방식">
        <button role="tab" aria-selected={tab === "solo"} className={`mode${tab === "solo" ? " on" : ""}`} onClick={() => setTab("solo")} data-testid="mode-solo">
          <strong>🙋 혼자</strong>
          <span className="muted small">{game.kind === "record" ? "최고 기록 도전" : "컴퓨터와 대결"}</span>
        </button>
        <button role="tab" aria-selected={tab === "friend"} className={`mode${tab === "friend" ? " on" : ""}`} onClick={() => setTab("friend")} data-testid="mode-friend">
          <strong>👥 친구와</strong>
          <span className="muted small">링크·코드로 초대</span>
        </button>
        <button role="tab" aria-selected={tab === "random"} className={`mode${tab === "random" ? " on" : ""}`} onClick={() => setTab("random")} data-testid="mode-random">
          <strong>🎲 랜덤 상대</strong>
          <span className="muted small">실제 이용자와 매칭</span>
        </button>
      </div>

      {tab === "solo" && (
        <Suspense fallback={<div className="panel center muted">불러오는 중…</div>}>
          <Solo />
        </Suspense>
      )}
      {tab === "friend" && <FriendStart gameId={game.id} />}
      {tab === "random" && <RandomStart gameId={game.id} onSolo={() => setTab("solo")} onFriend={() => setTab("friend")} />}
    </div>
  );
}

function FriendStart({ gameId }: { gameId: string }) {
  const nav = useNavigate();
  const live = useLive();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="panel center">
      <p>방을 만들면 초대 링크가 생겨요. 친구가 링크로 들어오면 바로 시작!</p>
      <button
        className="btn primary big"
        data-testid="friend-create"
        disabled={live.status !== "online"}
        onClick={async () => {
          const r = await send<{ code: string }>("room:create", { gameId });
          if (r.ok) nav(`/r/${r.code}`);
          else if (r.error === "ALREADY_IN_ROOM" && live.room) nav(`/r/${live.room.code}`);
          else setErr(errorText(r));
        }}
      >
        방 만들고 초대하기
      </button>
      {err && <p className="danger small">{err}</p>}
    </div>
  );
}

function RandomStart({ gameId, onSolo, onFriend }: { gameId: string; onSolo(): void; onFriend(): void }) {
  const live = useLive();
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const waiting = live.queue.gameId === gameId;
  // 대기 시간은 이 브라우저 시계로 잰다(서버와 시계가 어긋나도 안내 시점이 틀어지지 않게)
  const [waitStart, setWaitStart] = useState<number | null>(null);
  useEffect(() => setWaitStart(waiting ? Date.now() : null), [waiting]);

  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [waiting]);

  // 이 화면을 떠나면 대기 취소
  useEffect(() => () => void send("queue:leave"), []);

  const waitedMs = waiting && waitStart ? Math.max(0, now - waitStart) : 0;

  if (!waiting) {
    return (
      <div className="panel center">
        <p>같은 게임을 고른 실제 이용자와 연결해요. 중간에 나가면 기권패로 기록돼요.</p>
        <button
          className="btn primary big"
          data-testid="random-join"
          disabled={live.status !== "online"}
          onClick={async () => {
            setErr(null);
            const r = await send("queue:join", { gameId });
            if (!r.ok) setErr(errorText(r));
          }}
        >
          랜덤 상대 찾기
        </button>
        {err && <p className="danger small">{err}</p>}
      </div>
    );
  }

  return (
    <div className="panel center" data-testid="queue-panel">
      <div className="spinner" aria-hidden />
      <p>
        상대를 찾는 중… <strong>{Math.floor(waitedMs / 1000)}초</strong>
      </p>
      {waitedMs > QUEUE_HINT_AFTER_MS && (
        <div className="stack small-gap">
          <p className="muted">지금은 이 게임을 기다리는 사람이 적어요. 계속 기다리거나 다른 방법으로 즐겨 보세요.</p>
          <div className="row gap center wrap">
            <button className="btn" onClick={onSolo}>
              혼자 하기
            </button>
            <button className="btn" onClick={onFriend}>
              친구 초대하기
            </button>
          </div>
        </div>
      )}
      <button className="btn ghost" onClick={() => void send("queue:leave")}>
        취소
      </button>
    </div>
  );
}
