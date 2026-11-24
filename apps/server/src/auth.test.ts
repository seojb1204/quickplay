import { afterEach, describe, expect, it } from "vitest";
import { ACCOUNT_TOKEN_TTL_MS, signSession, verifySession } from "./auth.js";
import { emit, startServer, waitFor } from "./testkit.js";

const SECRET = "test-secret-test-secret-test-secret!";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const j = (r: Response): Promise<any> => r.json();

describe("세션 토큰", () => {
  it("회원 토큰은 30일 뒤 만료", () => {
    const t = signSession(SECRET, { id: "a_1", nickname: "회원", kind: "account" }, 1000);
    expect(verifySession(SECRET, t, 1000 + ACCOUNT_TOKEN_TTL_MS - 1)?.kind).toBe("account");
    expect(verifySession(SECRET, t, 1000 + ACCOUNT_TOKEN_TTL_MS + 1)).toBeNull();
  });
  it("비회원 토큰을 회원으로 바꿔치기하면 서명 불일치로 거부", () => {
    const t = signSession(SECRET, { id: "g_1", nickname: "게스트", kind: "guest" });
    const [p, sig] = t.split(".");
    const body = JSON.parse(Buffer.from(p!, "base64url").toString());
    body.k = "account";
    body.exp = Date.now() + 1e9;
    const forged = `${Buffer.from(JSON.stringify(body)).toString("base64url")}.${sig}`;
    expect(verifySession(SECRET, forged)).toBeNull();
  });
});

describe("구글 로그인", () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  afterEach(async () => srv?.close());

  // 가짜 검증기: "good:<sub>" 형태만 통과
  const fakeVerify = async (c: string) => (c.startsWith("good:") ? { sub: c.slice(5) } : null);

  const login = (credential: string, token?: string) =>
    fetch(`${srv.base}/api/auth/google`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credential, token }),
    });

  it("클라이언트 ID 가 없으면 로그인 꺼짐(503), 설정 API 는 null", async () => {
    srv = await startServer({ googleClientId: null });
    expect((await login("good:1")).status).toBe(503);
    expect((await fetch(`${srv.base}/api/config`).then(j)).googleClientId).toBeNull();
  });

  it("잘못된 구글 토큰은 401", async () => {
    srv = await startServer({ googleClientId: "cid" }, { verifyGoogle: fakeVerify });
    expect((await login("bad")).status).toBe(401);
    expect((await login("")).status).toBe(401);
  });

  it("로그인하면 비회원 기록이 회원으로 옮겨지고, 랜덤 승리가 랭킹에 반영되며, 다시 로그인해도 같은 회원", async () => {
    srv = await startServer({ googleClientId: "cid" }, { verifyGoogle: fakeVerify });
    // 게스트 a 가 랜덤 오목에서 상대 기권으로 1승
    const nick = `나그네${Math.random().toString(36).slice(2, 6)}`;
    const sub = `sub-${Math.random()}`;
    const a = await srv.client(nick);
    const b = await srv.client("상대");
    await emit(a, "queue:join", { gameId: "gomoku" });
    await emit(b, "queue:join", { gameId: "gomoku" });
    await waitFor(() => a.last.start && b.last.start, 3000, "matched");
    await emit(b, "room:leave", {});
    await waitFor(() => a.last.end, 2000, "end");
    await new Promise((r) => setTimeout(r, 50));

    const r1 = await login(`good:${sub}`, a.session.token).then(j);
    expect(r1.kind).toBe("account");
    expect(r1.nickname).toBe(nick); // 게스트 닉네임 이어받기
    expect(r1.merged).toBe(1);

    const stats = await fetch(`${srv.base}/api/me/stats`, { headers: { authorization: `Bearer ${r1.token}` } }).then(j);
    expect(stats.user.kind).toBe("account");
    expect(stats.stats[0]).toMatchObject({ gameId: "gomoku", wins: 1 });

    const lb = await fetch(`${srv.base}/api/leaderboard/gomoku`).then(j);
    expect(lb.rows.find((r: { nickname: string }) => r.nickname === nick)).toMatchObject({ value: 1 });

    // 다른 기기에서 같은 구글 계정 → 같은 회원 id
    const r2 = await login(`good:${sub}`).then(j);
    expect(r2.userId).toBe(r1.userId);
    expect(r2.merged).toBe(0);

    // 회원 토큰으로 실시간 접속, 방 화면에 게스트 표시 없음
    const acc = await srv.client(undefined, { token: r1.token, userId: r1.userId, nickname: r1.nickname, kind: "account" });
    const room = await emit<{ ok: boolean; code: string }>(acc, "room:create", {});
    expect(room.ok).toBe(true);
    await waitFor(() => acc.last.room, 2000, "room");
    expect(acc.last.room!.players[0]!.guest).toBe(false);

    // 회원 토큰으로 /api/guest(세션 갱신) 해도 회원 유지
    const refreshed = await fetch(`${srv.base}/api/guest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: r1.token }),
    }).then(j);
    expect(refreshed.kind).toBe("account");
    expect(refreshed.userId).toBe(r1.userId);
  });

  it("회원 기록을 다른 회원에게 옮길 수는 없다(회원→회원 병합 거부)", async () => {
    srv = await startServer({ googleClientId: "cid" }, { verifyGoogle: fakeVerify });
    const first = await login(`good:A${Math.random()}`).then(j);
    const second = await login(`good:B${Math.random()}`, first.token).then(j);
    expect(second.merged).toBe(0);
    expect(second.userId).not.toBe(first.userId);
  });

  it("만료·위조된 토큰으로 세션 갱신 시 새 비회원 + expired 표시", async () => {
    srv = await startServer();
    const r = await fetch(`${srv.base}/api/guest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "garbage.token" }),
    }).then(j);
    expect(r.kind).toBe("guest");
    expect(r.expired).toBe(true);
  });
});
