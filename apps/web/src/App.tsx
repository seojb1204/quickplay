import { useEffect } from "react";
import { Link, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { connectLive, reconnectLive, useLive } from "./lib/live";
import Home from "./pages/Home";
import GamePage from "./pages/GamePage";
import RoomPage from "./pages/RoomPage";
import Records from "./pages/Records";

export default function App() {
  const live = useLive();
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => connectLive(), []);

  // 랜덤 매칭이 성사되어 경기가 시작되면 어느 화면에 있든 대전 방으로 이동
  // (끝난 랜덤 방으로 계속 끌려가지 않도록 "경기 중"일 때만)
  useEffect(() => {
    if (live.room && live.room.mode === "random" && live.room.phase === "playing" && !loc.pathname.startsWith(`/r/${live.room.code}`)) {
      nav(`/r/${live.room.code}`);
    }
  }, [live.room, loc.pathname, nav]);

  return (
    <div className="app">
      <header className="top">
        <Link to="/" className="logo">
          <span aria-hidden>🎮</span> QuickPlay
        </Link>
        <nav className="row gap">
          {live.room && !loc.pathname.startsWith(`/r/${live.room.code}`) && (
            <Link to={`/r/${live.room.code}`} className="chip warn">
              참여 중인 방 {live.room.code}
            </Link>
          )}
          <Link to="/me" className="chip">
            내 기록
          </Link>
        </nav>
      </header>
      {live.status === "offline" && (
        <div className="banner warn">
          서버 연결이 끊겼어요. 다시 연결하는 중…{" "}
          <button className="link" onClick={reconnectLive}>
            지금 재시도
          </button>
        </div>
      )}
      {live.status === "replaced" && <div className="banner warn">다른 탭에서 QuickPlay 를 열어 이 탭의 연결이 해제됐어요. 새로고침하면 이 탭으로 돌아옵니다.</div>}
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/g/:gameId" element={<GamePage />} />
          <Route path="/r/:code" element={<RoomPage />} />
          <Route path="/me" element={<Records />} />
          <Route
            path="*"
            element={
              <div className="panel center">
                <h2>페이지를 찾을 수 없어요</h2>
                <Link className="btn" to="/">
                  홈으로
                </Link>
              </div>
            }
          />
        </Routes>
      </main>
      <footer className="foot muted small">QuickPlay · 설치 없이 바로 한 판 · 베타</footer>
    </div>
  );
}
