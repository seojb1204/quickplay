import { useEffect, useState } from "react";
import { GAMES, getGame, type GameStatsRow, type LeaderRow, type RecentRow } from "@qp/shared";
import { apiGet, loginExpired, logout, renameGuest } from "../lib/api";
import { GoogleLoginButton } from "../components/GoogleLogin";

interface Me {
  user: { id: string; nickname: string; kind: string };
  stats: GameStatsRow[];
  recent: RecentRow[];
}

const OUT: Record<string, string> = { win: "승", loss: "패", draw: "무" };
const MODE: Record<string, string> = { solo: "혼자", friend: "친구", random: "랜덤" };

export default function Records() {
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nick, setNick] = useState("");
  const [rankGame, setRankGame] = useState("snake");
  const [rank, setRank] = useState<{ rows: LeaderRow[]; metric: string } | null>(null);

  const load = () =>
    apiGet<Me>("/api/me/stats")
      .then((m) => {
        setMe(m);
        setNick(m.user.nickname);
      })
      .catch((e) => setErr(String(e.message)));

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    void apiGet<{ rows: LeaderRow[]; metric: string }>(`/api/leaderboard/${rankGame}`).then(setRank).catch(() => setRank(null));
  }, [rankGame]);

  return (
    <div className="stack">
      <section className="panel">
        <h2>내 정보</h2>
        {me && (
          <form
            className="row gap wrap"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await renameGuest(nick);
                // 실시간 연결은 접속 시점의 닉네임을 쓰므로 새로고침해 새 토큰으로 다시 연결
                location.reload();
              } catch (x) {
                setErr((x as Error).message);
              }
            }}
          >
            <input aria-label="닉네임" value={nick} maxLength={12} onChange={(e) => setNick(e.target.value)} />
            <button className="btn">닉네임 변경</button>
          </form>
        )}
        {me?.user.kind === "account" ? (
          <div className="row gap wrap" data-testid="logged-in">
            <span>✅ 구글 계정으로 로그인됨 · 기록이 계정에 저장되고 랭킹에 참여해요.</span>
            <button
              className="btn ghost small"
              onClick={() => {
                logout();
                location.reload();
              }}
            >
              로그아웃
            </button>
          </div>
        ) : (
          <div className="stack small-gap">
            {loginExpired && <p className="banner warn">로그인이 만료됐어요. 다시 로그인하면 계정 기록을 이어서 볼 수 있어요.</p>}
            <p className="muted small">
              지금은 <strong>게스트</strong>로 플레이 중이에요. 기록은 이 브라우저에만 연결돼 있어요. 로그인하면 지금까지의 기록이 계정으로 옮겨지고 랭킹에 참여해요.
              (저장하는 정보: 구글 계정 고유번호와 닉네임뿐 — 이메일·이름은 저장하지 않아요)
            </p>
            <GoogleLoginButton />
          </div>
        )}
        {err && <p className="small">{err}</p>}
      </section>

      <section className="panel">
        <h2>게임별 기록</h2>
        {!me ? (
          <p className="muted">불러오는 중…</p>
        ) : me.stats.length === 0 ? (
          <p className="muted">아직 기록이 없어요. 한 판 해볼까요?</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>게임</th>
                <th>판수</th>
                <th>승</th>
                <th>패</th>
                <th>무</th>
                <th>승률</th>
                <th>최고점</th>
              </tr>
            </thead>
            <tbody>
              {me.stats.map((s) => {
                const decided = s.wins + s.losses + s.draws;
                return (
                  <tr key={s.gameId}>
                    <td>{getGame(s.gameId)?.name ?? s.gameId}</td>
                    <td>{s.plays}</td>
                    <td>{s.wins}</td>
                    <td>{s.losses}</td>
                    <td>{s.draws}</td>
                    <td>{decided ? `${Math.round((s.wins / decided) * 100)}%` : "-"}</td>
                    <td>{s.best ?? "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>최근 플레이</h2>
        {me?.recent.length ? (
          <ul className="list">
            {me.recent.map((r, i) => (
              <li key={i}>
                <span>{getGame(r.gameId)?.name}</span>
                <span className="muted">{MODE[r.mode] ?? r.mode}</span>
                <span>{r.outcome ? OUT[r.outcome] : r.mode === "solo" ? `${r.score}점` : "기록 없음"}</span>
                <span className="muted small">{new Date(r.at).toLocaleString("ko-KR")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">최근 플레이가 없어요.</p>
        )}
      </section>

      <section className="panel">
        <div className="row between wrap gap">
          <h2>랭킹</h2>
          <select aria-label="랭킹 게임" value={rankGame} onChange={(e) => setRankGame(e.target.value)}>
            {GAMES.filter((g) => g.status === "ready").map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        {rank && rank.rows.length > 0 ? (
          <ol className="list">
            {rank.rows.map((r) => (
              <li key={r.rank}>
                <span>#{r.rank}</span> <span>{r.nickname}</span> <strong>{r.value}</strong>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">아직 랭킹 기록이 없어요. 랭킹은 로그인한 회원의 기록만 집계해요(대전 승수는 랜덤 대전만).</p>
        )}
      </section>
    </div>
  );
}
