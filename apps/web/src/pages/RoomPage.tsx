import { Suspense, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { GAMES, getGame, type RoomView } from "@qp/shared";
import { gameUis } from "../games/registry";
import { ensureSession } from "../lib/api";
import { errorText, getLive, send, useLive } from "../lib/live";

export default function RoomPage() {
  const { code = "" } = useParams();
  const live = useLive();
  const nav = useNavigate();
  const [joinErr, setJoinErr] = useState<{ error: string; text: string } | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const room = live.room && live.room.code === code.toUpperCase() ? live.room : null;

  useEffect(() => {
    void ensureSession().then((s) => setMe(s.userId));
  }, []);

  // 링크로 들어온 경우 자동 참여
  const tryJoin = useCallback(async () => {
    const r = await send("room:join", { code });
    if (!r.ok) setJoinErr({ error: r.error, text: errorText(r) });
    else setJoinErr(null);
  }, [code]);

  useEffect(() => {
    if (live.status !== "online") return;
    if (getLive().room?.code === code.toUpperCase()) return;
    void tryJoin();
  }, [live.status, code, tryJoin]);

  if (!room) {
    if (joinErr) {
      return (
        <div className="panel center" data-testid="join-error">
          <h2>입장할 수 없어요</h2>
          <p>{joinErr.text}</p>
          <div className="row gap center wrap">
            {joinErr.error === "ALREADY_IN_ROOM" && live.room && (
              <>
                <Link className="btn" to={`/r/${live.room.code}`}>
                  원래 방으로
                </Link>
                <button
                  className="btn primary"
                  onClick={async () => {
                    await send("room:leave");
                    void tryJoin();
                  }}
                >
                  나가고 이 방에 입장
                </button>
              </>
            )}
            <Link className="btn" to="/">
              홈으로
            </Link>
          </div>
        </div>
      );
    }
    return <div className="panel center muted">방에 들어가는 중…</div>;
  }

  return <Room room={room} me={me} onLeft={() => nav("/")} />;
}

function Room({ room, me, onLeft }: { room: RoomView; me: string | null; onLeft(): void }) {
  const live = useLive();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mine = room.players.find((p) => p.id === me);
  const other = room.players.find((p) => p.id !== me);
  const game = room.gameId ? getGame(room.gameId) : null;
  const ui = room.gameId ? gameUis[room.gameId] : null;
  const serverNow = useCallback(() => Date.now() + getLive().clockOffset, []);

  const leave = async () => {
    await send("room:leave");
    onLeft();
  };

  const playing = room.phase === "playing" && live.start && ui && game;
  const Versus = ui?.Versus;

  return (
    <div className="stack">
      <div className="row between wrap gap">
        <div>
          <h2>
            {room.mode === "random" ? "🎲 랜덤 대전" : "👥 친구방"} {game && <span className="muted">· {game.name}</span>}
          </h2>
          <p className="muted small">
            {room.players.map((p) => (
              <span key={p.id} className={`player${p.connected ? "" : " off"}`}>
                {p.nickname}
                {p.id === me ? " (나)" : ""}
                {p.guest ? " · 게스트" : ""}
                {!p.connected ? " · 재접속 대기" : ""}
                {room.phase !== "playing" && p.ready ? " ✅" : ""}
              </span>
            ))}
          </p>
        </div>
        <button className="btn ghost" onClick={() => (room.phase === "playing" ? setConfirmLeave(true) : void leave())} data-testid="leave-room">
          나가기
        </button>
      </div>

      {room.reconnectDeadline && other && !other.connected && (
        <div className="banner warn">상대 연결이 끊겼어요. {Math.max(0, Math.ceil((room.reconnectDeadline - Date.now()) / 1000))}초 안에 돌아오지 않으면 {room.mode === "random" ? "기권 처리돼요" : "방에서 나가게 돼요"}.</div>
      )}

      {playing && Versus && live.start ? (
        <Suspense fallback={<div className="panel center muted">불러오는 중…</div>}>
          <Countdown startAt={live.start.startAt} serverNow={serverNow} />
          <Versus
            key={live.start.matchId}
            seat={live.start.seat}
            seed={live.start.seed}
            startAt={live.start.startAt}
            me={mine?.nickname ?? "나"}
            opponent={other?.nickname ?? "상대"}
            serverNow={serverNow}
          />
          <div className="row center">
            <button className="btn ghost small" onClick={() => setConfirmLeave(true)} data-testid="forfeit">
              {room.mode === "random" ? "기권하기" : "그만하기"}
            </button>
          </div>
        </Suspense>
      ) : (
        <>
          {room.lastResult && <ResultPanel room={room} me={mine?.seat ?? null} />}
          {room.mode === "friend" && room.players.length < 2 && <Invite code={room.code} />}
          {room.mode === "friend" && <GamePicker room={room} onError={setErr} />}
          {room.gameId && room.players.length === 2 && (
            <div className="panel center">
              {mine?.ready ? (
                <>
                  <p>상대가 준비하면 시작해요…</p>
                  <button className="btn" onClick={() => void send("room:ready", { ready: false })}>
                    준비 취소
                  </button>
                </>
              ) : (
                <button
                  className="btn primary big"
                  data-testid="ready"
                  onClick={async () => {
                    const r = await send("room:ready", { ready: true });
                    if (!r.ok) setErr(errorText(r));
                  }}
                >
                  {room.lastResult ? (room.lastResult.gameId === room.gameId ? "재대결 준비" : "이 게임으로 준비") : "준비 완료"}
                </button>
              )}
            </div>
          )}
          {room.mode === "random" && room.players.length < 2 && (
            <div className="panel center">
              <p className="muted">상대가 방을 나갔어요.</p>
              <Link className="btn primary" to={`/g/${room.gameId}`} onClick={() => void send("room:leave")}>
                새 상대 찾기
              </Link>
            </div>
          )}
          {err && <p className="danger small center">{err}</p>}
        </>
      )}

      {confirmLeave && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="panel center">
            <p>{room.mode === "random" ? "지금 나가면 기권패로 기록돼요. 나갈까요?" : "경기를 그만할까요? 친구전은 기록이 남지 않아요."}</p>
            <div className="row gap center">
              <button className="btn" onClick={() => setConfirmLeave(false)}>
                계속하기
              </button>
              <button
                className="btn danger"
                data-testid="confirm-forfeit"
                onClick={async () => {
                  setConfirmLeave(false);
                  await send("match:forfeit");
                }}
              >
                {room.mode === "random" ? "기권" : "그만하기"}
              </button>
              <button
                className="btn ghost"
                onClick={async () => {
                  setConfirmLeave(false);
                  await leave();
                }}
              >
                방에서 나가기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Countdown({ startAt, serverNow }: { startAt: number; serverNow(): number }) {
  const [left, setLeft] = useState(() => startAt - serverNow());
  useEffect(() => {
    const t = setInterval(() => setLeft(startAt - serverNow()), 100);
    return () => clearInterval(t);
  }, [startAt, serverNow]);
  if (left <= 0) return null;
  return (
    <div className="countdown" aria-live="polite">
      {Math.ceil(left / 1000)}
    </div>
  );
}

function ResultPanel({ room, me }: { room: RoomView; me: 0 | 1 | null }) {
  const r = room.lastResult!;
  const mine = me !== null && r.outcomes ? r.outcomes[me] : null;
  const title = mine === "win" ? "🎉 승리!" : mine === "loss" ? "패배" : mine === "draw" ? "무승부" : "경기 종료";
  return (
    <div className={`panel center result ${mine ?? ""}`} data-testid="result">
      <h2 data-testid="result-title">{title}</h2>
      <p>{r.summary}</p>
      <p className="muted small">
        {getGame(r.gameId)?.name} · {r.scores[0]} : {r.scores[1]}
        {r.reason === "forfeit" ? " · 기권" : r.reason === "disconnect" ? " · 연결 끊김" : r.reason === "timeout" ? " · 시간 초과" : ""}
      </p>
    </div>
  );
}

function Invite({ code }: { code: string }) {
  const url = `${location.origin}/r/${code}`;
  const [copied, setCopied] = useState(false);
  return (
    <div className="panel center invite">
      <p>친구에게 보내세요</p>
      <div className="code" data-testid="room-code">
        {code}
      </div>
      <div className="row gap center wrap">
        <button
          className="btn primary"
          onClick={async () => {
            try {
              if (navigator.share) await navigator.share({ title: "QuickPlay 한 판?", url });
              else {
                await navigator.clipboard.writeText(url);
                setCopied(true);
              }
            } catch {
              /* 공유 취소 */
            }
          }}
        >
          {copied ? "링크 복사됨 ✓" : "초대 링크 공유"}
        </button>
      </div>
      <p className="muted small">{url}</p>
    </div>
  );
}

function GamePicker({ room, onError }: { room: RoomView; onError(e: string | null): void }) {
  return (
    <div className="panel">
      <p className="muted small">{room.gameId ? "다른 게임으로 바꾸기" : "같이 할 게임을 고르세요"}</p>
      <div className="picker">
        {GAMES.filter((g) => g.status === "ready").map((g) => (
          <button
            key={g.id}
            className={`pick${room.gameId === g.id ? " on" : ""}`}
            data-testid={`pick-${g.id}`}
            onClick={async () => {
              const r = await send("room:selectGame", { gameId: g.id });
              onError(r.ok ? null : errorText(r));
            }}
          >
            <span aria-hidden>{g.emoji}</span> {g.name}
          </button>
        ))}
      </div>
    </div>
  );
}
