import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as connect } from "socket.io-client";
import { GOMOKU_SIZE, SNAKE } from "@qp/shared";
import { emit, sleep, startServer, waitFor, type Client } from "./testkit.js";

type Srv = Awaited<ReturnType<typeof startServer>>;
let srv: Srv;

beforeEach(async () => {
  srv = await startServer();
});
afterEach(async () => {
  await srv.close();
});

const idx = (x: number, y: number) => y * GOMOKU_SIZE + x;
// 테스트에서 응답 JSON 을 자유롭게 검사하기 위한 도우미
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const j = (r: Response): Promise<any> => r.json();

async function friendPair(gameId: string) {
  const a = await srv.client("에이");
  const b = await srv.client("비이");
  const c = await emit<{ ok: boolean; code: string }>(a, "room:create", { gameId });
  expect(c.ok).toBe(true);
  expect(await emit(b, "room:join", { code: c.code.toLowerCase() })).toMatchObject({ ok: true });
  return { a, b, code: c.code };
}

async function startFriendMatch(a: Client, b: Client) {
  await emit(a, "room:ready", { ready: true });
  await emit(b, "room:ready", { ready: true });
  await waitFor(() => a.last.start && b.last.start, 3000, "match:start");
  await waitFor(() => Date.now() >= a.last.start!.startAt + 20, 3000, "countdown");
}

/** seat 기준으로 클라이언트를 돌려준다(재대결 시 자리 교대 고려) */
function bySeat(a: Client, b: Client): [Client, Client] {
  return a.last.start!.seat === 0 ? [a, b] : [b, a];
}

describe("인증·세션", () => {
  it("비회원 토큰 발급, 닉네임 변경 시 같은 id 유지", async () => {
    const s = await srv.guest();
    expect(s.userId).toMatch(/^g_/);
    const s2 = await srv.guest("새이름", s.token);
    expect(s2.userId).toBe(s.userId);
    expect(s2.nickname).toBe("새이름");
  });

  it("잘못된 닉네임 거부", async () => {
    const r = await fetch(`${srv.base}/api/guest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nickname: "a" }),
    });
    expect(r.status).toBe(400);
  });

  it("위조·변조 토큰으로는 소켓 접속 불가", async () => {
    const s = await srv.guest("진짜");
    const [payload, sig] = s.token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ uid: "g_victim", nick: "x", iat: 1 })).toString("base64url");
    for (const token of ["garbage", `${forgedPayload}.${sig}`, `${payload}.AAAA`]) {
      const sock = connect(srv.base, { auth: { token }, transports: ["websocket"], reconnection: false, forceNew: true });
      const err = await new Promise<Error>((res) => sock.once("connect_error", res));
      expect(err.message).toBe("UNAUTHORIZED");
      sock.disconnect();
    }
  });

  it("같은 계정으로 새 연결이 오면 이전 연결은 대체된다", async () => {
    const a1 = await srv.client("탭하나");
    let replaced = false;
    a1.on("session:replaced", () => (replaced = true));
    await srv.client(undefined, a1.session);
    await waitFor(() => replaced, 2000, "replaced");
  });

  it("인증 없는 기록 조회는 401", async () => {
    const r = await fetch(`${srv.base}/api/me/stats`);
    expect(r.status).toBe(401);
  });
});

describe("친구방", () => {
  it("생성·코드 참여(대소문자 무관)·잘못된 코드·정원 초과·중복 참여", async () => {
    const { a, code } = await friendPair("gomoku");
    await waitFor(() => a.last.room?.players.length === 2, 2000, "2 players");
    const c = await srv.client("씨이");
    expect(await emit(c, "room:join", { code: "ZZZZZZ" })).toMatchObject({ ok: false, error: "ROOM_NOT_FOUND" });
    expect(await emit(c, "room:join", { code })).toMatchObject({ ok: false, error: "ROOM_FULL" });
    expect(await emit(a, "room:create", {})).toMatchObject({ ok: false, error: "ALREADY_IN_ROOM" });
    expect(await emit(a, "queue:join", { gameId: "gomoku" })).toMatchObject({ ok: false, error: "ALREADY_IN_ROOM" });
  });

  it("방 먼저 만들고 게임 고르기(흐름 B), 준비 안 된 게임은 거부", async () => {
    const a = await srv.client("방장");
    const r = await emit<{ ok: boolean; code: string }>(a, "room:create", {});
    expect(r.ok).toBe(true);
    expect(await emit(a, "room:ready", { ready: true })).toMatchObject({ ok: false, error: "INVALID_ACTION" });
    expect(await emit(a, "room:selectGame", { gameId: "tanks" })).toMatchObject({ ok: false });
    expect(await emit(a, "room:selectGame", { gameId: "nope" })).toMatchObject({ ok: false, error: "UNKNOWN_GAME" });
    expect(await emit(a, "room:selectGame", { gameId: "gomoku" })).toMatchObject({ ok: true });
    await waitFor(() => a.last.room?.gameId === "gomoku", 2000, "game selected");
  });

  it("오목 친구전: 차례 검증, 승리 판정이 양쪽에 동일, 기록 1회 저장, 재대결 시 자리 교대, 다른 게임 선택", async () => {
    const { a, b } = await friendPair("gomoku");
    await startFriendMatch(a, b);
    const [black, white] = bySeat(a, b);
    expect(await emit(white, "match:action", { type: "move", data: { index: 0 } })).toMatchObject({
      ok: false,
      error: "INVALID_ACTION",
    });
    for (let i = 0; i < 4; i++) {
      expect(await emit(black, "match:action", { type: "move", data: { index: idx(i, 0) } })).toMatchObject({ ok: true });
      expect(await emit(white, "match:action", { type: "move", data: { index: idx(i, 1) } })).toMatchObject({ ok: true });
    }
    // 이미 둔 칸
    expect(await emit(black, "match:action", { type: "move", data: { index: idx(0, 1) } })).toMatchObject({ ok: false });
    expect(await emit(black, "match:action", { type: "move", data: { index: idx(4, 0) } })).toMatchObject({ ok: true });
    await waitFor(() => a.last.end && b.last.end, 2000, "match:end");
    expect(a.last.end).toEqual(b.last.end);
    expect(a.last.end!.outcomes![black.last.start!.seat]).toBe("win");
    expect(a.last.end!.reason).toBe("normal");
    // 경기 종료 후 착수 거부
    expect(await emit(white, "match:action", { type: "move", data: { index: idx(9, 9) } })).toMatchObject({ ok: false, error: "NOT_PLAYING" });

    await sleep(50);
    const stats = await fetch(`${srv.base}/api/me/stats`, { headers: { authorization: `Bearer ${black.session.token}` } }).then(j);
    expect(stats.stats.find((s: { gameId: string }) => s.gameId === "gomoku")).toMatchObject({ plays: 1, wins: 1 });

    // 재대결 → 자리 교대
    const prevSeat = black.last.start!.seat;
    a.last.start = null;
    b.last.start = null;
    await startFriendMatch(a, b);
    expect(black.last.start!.seat).not.toBe(prevSeat);

    // 친구가 나가면(기권) 친구전은 기록 없이 종료
    expect(await emit(a, "match:forfeit", {})).toMatchObject({ ok: true });
    await waitFor(() => b.last.end, 2000, "abandon end");
    expect(b.last.end!.reason).toBe("abandoned");
    expect(b.last.end!.outcomes).toBeNull();

    // 같은 친구와 다른 게임 선택
    expect(await emit(a, "room:selectGame", { gameId: "snake" })).toMatchObject({ ok: true });
    await waitFor(() => b.last.room?.gameId === "snake" && b.last.room.phase === "result", 2000, "switch game");
  });

  it("한 수 제한 시간 초과 시 시간패 (제한 시간을 300ms 로 줄여 검증)", async () => {
    await srv.close();
    srv = await startServer({ gomokuTurnMs: 300 });
    const { a, b } = await friendPair("gomoku");
    await startFriendMatch(a, b);
    const [black] = bySeat(a, b);
    // 흑이 두지 않으면 흑 시간패
    await waitFor(() => a.last.end && b.last.end, 3000, "timeout end");
    expect(a.last.end!.reason).toBe("timeout");
    expect(a.last.end!.outcomes![black.last.start!.seat]).toBe("loss");
  });

  it("새로 들어온 사람에게 이전 사람의 결과를 보여주지 않는다", async () => {
    const { a, b, code } = await friendPair("gomoku");
    await startFriendMatch(a, b);
    await emit(a, "match:forfeit", {});
    await waitFor(() => b.last.room?.lastResult, 2000, "result");
    await emit(a, "room:leave", {});
    await waitFor(() => b.last.room?.players.length === 1, 2000, "a left");
    expect(b.last.room!.lastResult).not.toBeNull(); // 남은 사람은 방금 경기 당사자
    const c = await srv.client("새친구");
    expect(await emit(c, "room:join", { code })).toMatchObject({ ok: true });
    await waitFor(() => c.last.room, 2000, "c room");
    expect(c.last.room!.lastResult).toBeNull();
    expect(c.last.room!.phase).toBe("lobby");
  });
});

describe("랜덤 매칭", () => {
  it("두 명이 같은 게임 대기 → 즉시 매칭(p95 목표 3초), 중복 대기 거부, 다른 게임끼리는 매칭 안 됨", async () => {
    const a = await srv.client();
    const b = await srv.client();
    const c = await srv.client();
    expect(await emit(a, "queue:join", { gameId: "gomoku" })).toMatchObject({ ok: true });
    expect(await emit(a, "queue:join", { gameId: "gomoku" })).toMatchObject({ ok: false, error: "ALREADY_QUEUED" });
    expect(await emit(c, "queue:join", { gameId: "snake" })).toMatchObject({ ok: true });
    const t0 = Date.now();
    expect(await emit(b, "queue:join", { gameId: "gomoku" })).toMatchObject({ ok: true });
    await waitFor(() => a.last.start && b.last.start, 3000, "matched");
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(a.last.room?.mode).toBe("random");
    expect(c.last.start).toBeNull();
    // 랜덤 방은 코드로 참여 불가
    const d = await srv.client();
    expect(await emit(d, "room:join", { code: a.last.room!.code })).toMatchObject({ ok: false, error: "ROOM_NOT_FOUND" });
  });

  it("랜덤 대전 중 나가면 기권패, 상대 승리, 결과 저장", async () => {
    const a = await srv.client();
    const b = await srv.client();
    await emit(a, "queue:join", { gameId: "gomoku" });
    await emit(b, "queue:join", { gameId: "gomoku" });
    await waitFor(() => a.last.start && b.last.start, 3000, "matched");
    expect(await emit(a, "room:leave", {})).toMatchObject({ ok: true });
    await waitFor(() => b.last.end, 2000, "forfeit end");
    const aSeat = a.last.start!.seat;
    expect(b.last.end!.reason).toBe("forfeit");
    expect(b.last.end!.outcomes![aSeat]).toBe("loss");
    expect(b.last.end!.outcomes![aSeat === 0 ? 1 : 0]).toBe("win");
    await sleep(50);
    const st = await fetch(`${srv.base}/api/me/stats`, { headers: { authorization: `Bearer ${a.session.token}` } }).then(j);
    expect(st.stats[0]).toMatchObject({ gameId: "gomoku", losses: 1 });
  });

  it("연결이 끊겨도 유예 시간 안에 재접속하면 경기 복구, 유예 초과 시 기권패", async () => {
    const a = await srv.client();
    const b = await srv.client();
    await emit(a, "queue:join", { gameId: "gomoku" });
    await emit(b, "queue:join", { gameId: "gomoku" });
    await waitFor(() => a.last.start && b.last.start, 3000, "matched");
    const matchId = a.last.start!.matchId;
    a.disconnect();
    await waitFor(() => b.last.room?.reconnectDeadline, 2000, "grace shown");
    const a2 = await srv.client(undefined, a.session);
    await waitFor(() => a2.last.start?.matchId === matchId, 2000, "restored");
    expect(a2.last.room?.phase).toBe("playing");
    expect(b.last.end).toBeNull();
    // 이번엔 끊고 돌아오지 않음 → 유예(400ms) 후 기권
    a2.disconnect();
    await waitFor(() => b.last.end, 3000, "disconnect forfeit");
    expect(b.last.end!.reason).toBe("disconnect");
  });

  it("같은 계정으로 새 탭을 열어도 대기열·준비 상태가 유지된다", async () => {
    const a = await srv.client();
    await emit(a, "queue:join", { gameId: "gomoku" });
    const a2 = await srv.client(undefined, a.session);
    await sleep(100);
    const b = await srv.client();
    await emit(b, "queue:join", { gameId: "gomoku" });
    await waitFor(() => a2.last.start && b.last.start, 3000, "matched with new tab");
  });

  it("양쪽 모두 연결이 끊기면 먼저 끊긴 쪽이 지지 않고 기록 없이 종료", async () => {
    const a = await srv.client();
    const b = await srv.client();
    const watcherA = { ...a.session };
    await emit(a, "queue:join", { gameId: "gomoku" });
    await emit(b, "queue:join", { gameId: "gomoku" });
    await waitFor(() => a.last.start && b.last.start, 3000, "matched");
    a.disconnect();
    await sleep(50);
    b.disconnect();
    await sleep(700); // 유예 400ms 경과
    const st = await fetch(`${srv.base}/api/me/stats`, { headers: { authorization: `Bearer ${watcherA.token}` } }).then(j);
    expect(st.stats).toEqual([]); // 승패 기록 없음
    const recent = st.recent[0];
    expect(recent.reason).toBe("abandoned");
  });

  it("대기 중 연결이 끊기면 대기열에서 빠진다", async () => {
    const a = await srv.client();
    await emit(a, "queue:join", { gameId: "snake" });
    a.disconnect();
    await sleep(100);
    const b = await srv.client();
    await emit(b, "queue:join", { gameId: "snake" });
    await sleep(300);
    expect(b.last.start).toBeNull();
  });
});

describe("패들 랠리(실시간)", () => {
  it("서버가 상태를 방송하고, 입력이 반영되며, 잘못된 입력은 거부", async () => {
    const a = await srv.client();
    const b = await srv.client();
    await emit(a, "queue:join", { gameId: "paddle" });
    await emit(b, "queue:join", { gameId: "paddle" });
    await waitFor(() => a.last.start && b.last.start, 3000, "matched");
    const [left] = bySeat(a, b);
    expect(await emit(left, "match:action", { type: "input", data: { dir: 2 } })).toMatchObject({ ok: false });
    expect(await emit(left, "match:action", { type: "input", data: { dir: -1 } })).toMatchObject({ ok: true });
    await waitFor(() => ((a.last.state as { t: number } | null)?.t ?? 0) > 30, 3000, "ticks");
    await sleep(800); // 420u/s 로 위쪽 끝(45)까지 이동할 시간
    const sa = a.last.state as { p: [number, number]; t: number };
    expect(sa.p[left.last.start!.seat]).toBe(45); // 맨 위(패들 높이의 절반)
    const sb = b.last.state as { t: number };
    expect(Math.abs(sa.t - sb.t)).toBeLessThanOrEqual(4); // 양쪽이 같은 상태를 받음
  });
});

describe("패들 랠리 — 연결 끊김", () => {
  it("끊긴 쪽 패들은 마지막 입력으로 계속 움직이지 않는다", async () => {
    const a = await srv.client();
    const b = await srv.client();
    await emit(a, "queue:join", { gameId: "paddle" });
    await emit(b, "queue:join", { gameId: "paddle" });
    await waitFor(() => a.last.start && b.last.start, 3000, "matched");
    await waitFor(() => Date.now() > a.last.start!.startAt + 50, 2000, "started");
    const seatA = a.last.start!.seat;
    await emit(a, "match:action", { type: "input", data: { dir: 1 } });
    await sleep(100);
    a.disconnect();
    await sleep(100);
    const y1 = (b.last.state as { p: [number, number] }).p[seatA];
    await sleep(250);
    const y2 = (b.last.state as { p: [number, number] }).p[seatA];
    expect(y2).toBe(y1);
  });
});

describe("꼬리잡기 뱀(기록 경쟁) — 서버 리플레이 검증", () => {
  it("재접속하면 서버가 받은 내 입력 기록을 돌려줘 이어서 할 수 있다", async () => {
    const { a, b } = await friendPair("snake");
    await startFriendMatch(a, b);
    await sleep(4 * SNAKE.TICK_MS);
    expect(await emit(a, "match:action", { type: "inputs", data: { inputs: [{ tick: 2, dir: "U" }], upTo: 3 } })).toMatchObject({ ok: true });
    const matchId = a.last.start!.matchId;
    a.disconnect();
    const a2 = await srv.client(undefined, a.session);
    await waitFor(() => a2.last.start?.matchId === matchId, 2000, "restored");
    expect(a2.last.start!.resume).toEqual({ inputs: [{ tick: 2, dir: "U" }], upTo: 3, frozen: false });
  });

  it("입력 보고를 5초 넘게 미루면 그 시점에서 동결되어 나중에 몰아 보낼 수 없다", async () => {
    const { a, b } = await friendPair("snake");
    await startFriendMatch(a, b);
    // b 만 꾸준히 보고(살아 있도록 위·아래로 지그재그)
    let upTo = 0;
    const dirs = ["D", "R", "U", "R"] as const;
    const t0 = Date.now();
    let k = 0;
    while (Date.now() - t0 < 6500) {
      await sleep(500);
      const now = Math.floor((Date.now() - b.last.start!.startAt) / SNAKE.TICK_MS);
      const inputs = now > upTo + 1 ? [{ tick: upTo + 1, dir: dirs[k++ % 4] }] : [];
      await emit(b, "match:action", { type: "inputs", data: { inputs, upTo: now } });
      upTo = now;
    }
    // 경기가 이미 끝났든(NOT_PLAYING) 진행 중이든(FROZEN) 늦은 입력은 거부
    const late = await emit(a, "match:action", { type: "inputs", data: { inputs: [], upTo: 5 } });
    expect(late.ok).toBe(false);
    expect((a.last.state as { frozen: [boolean, boolean] }).frozen[a.last.start!.seat]).toBe(true);
  });

  it("점수는 서버가 입력 기록으로 계산, 미래·과거 조작 거부, 양쪽 사망 시 즉시 확정", async () => {
    const { a, b } = await friendPair("snake");
    await startFriendMatch(a, b);
    // 미래 틱을 미리 보내기
    expect(await emit(a, "match:action", { type: "inputs", data: { inputs: [], upTo: SNAKE.VERSUS_TICKS } })).toMatchObject({
      ok: false,
      error: "INVALID_ACTION",
    });
    // 아무 입력 없이 직진 → 10틱째 벽 사망, 점수는 시드에 따라 0 또는 그 이상
    await sleep(10 * SNAKE.TICK_MS);
    expect(await emit(a, "match:action", { type: "inputs", data: { inputs: [], upTo: 10, done: true } })).toMatchObject({ ok: true });
    // 과거 고쳐 쓰기
    expect(await emit(a, "match:action", { type: "inputs", data: { inputs: [{ tick: 5, dir: "U" }], upTo: 10 } })).toMatchObject({
      ok: false,
    });
    expect(b.last.end).toBeNull();
    expect(await emit(b, "match:action", { type: "inputs", data: { inputs: [{ tick: 3, dir: "D" }], upTo: 12, done: true } })).toMatchObject({
      ok: true,
    });
    await waitFor(() => a.last.end && b.last.end, 2000, "snake end");
    expect(a.last.end).toEqual(b.last.end);
    expect(a.last.end!.outcomes).not.toBeNull();
  });
});

describe("솔로 기록(뱀) — 위조 방지", () => {
  it("시간보다 긴 플레이 주장 거부, 정상 제출은 서버 계산 점수 저장, 중복 제출·타인 세션 거부", async () => {
    const s = await srv.guest("솔로");
    const other = await srv.guest("남남");
    const h = (t: string) => ({ "content-type": "application/json", authorization: `Bearer ${t}` });
    const start = await fetch(`${srv.base}/api/solo/start`, { method: "POST", headers: h(s.token), body: JSON.stringify({ gameId: "snake" }) }).then(j);
    expect(start.sessionId).toBeTruthy();

    const bad = await fetch(`${srv.base}/api/solo/finish`, {
      method: "POST",
      headers: h(s.token),
      body: JSON.stringify({ sessionId: start.sessionId, inputs: [], endTick: 5000 }),
    });
    expect(bad.status).toBe(400);
    expect((await j(bad)).error).toBe("IMPLAUSIBLE_DURATION");

    const stolen = await fetch(`${srv.base}/api/solo/finish`, {
      method: "POST",
      headers: h(other.token),
      body: JSON.stringify({ sessionId: start.sessionId, inputs: [], endTick: 10 }),
    });
    expect(stolen.status).toBe(404);

    const ok = await fetch(`${srv.base}/api/solo/finish`, {
      method: "POST",
      headers: h(s.token),
      body: JSON.stringify({ sessionId: start.sessionId, inputs: [], endTick: 10, score: 9999 }),
    });
    expect(ok.status).toBe(200);
    const body = await j(ok);
    expect(body.score).toBeLessThan(10); // 클라이언트가 주장한 9999 는 무시됨

    const dup = await fetch(`${srv.base}/api/solo/finish`, {
      method: "POST",
      headers: h(s.token),
      body: JSON.stringify({ sessionId: start.sessionId, inputs: [], endTick: 10 }),
    });
    expect(dup.status).toBe(409);
  });

  it("랭킹은 회원 기록만 집계(비회원 기록은 제외)", async () => {
    const r = await fetch(`${srv.base}/api/leaderboard/snake`).then(j);
    expect(r.accountsOnly).toBe(true);
    expect(r.rows).toEqual([]);
  });
});

describe("잘못된 형식의 요청", () => {
  it("이상한 페이로드에도 서버가 죽지 않고 거부한다", async () => {
    const a = await srv.client();
    const raw = a as unknown as { emit: (...args: unknown[]) => void };
    raw.emit("room:join", null, () => {});
    raw.emit("room:create"); // ack 없음
    raw.emit("match:action", "문자열");
    const r = await emit(a, "room:join", { code: 12345 });
    expect(r).toMatchObject({ ok: false });
    const { a: x, b: y } = await friendPair("snake");
    await startFriendMatch(x, y);
    const huge = Array.from({ length: 2000 }, (_, i) => ({ tick: i + 1, dir: "U" }));
    expect(await emit(x, "match:action", { type: "inputs", data: { inputs: huge, upTo: 10 } })).toMatchObject({ ok: false });
    expect(await emit(x, "match:action", { type: "inputs", data: null })).toMatchObject({ ok: false });
    // 서버 정상
    expect((await fetch(`${srv.base}/api/health`)).status).toBe(200);
  });
});

describe("랭킹 집계 범위", () => {
  it("승수 랭킹은 회원의 랜덤 대전 승리만 센다(친구전 승수 몰아주기 차단)", async () => {
    const st = srv.store;
    // 실행마다 고유 id·닉네임(같은 DB 를 여러 번 써도 섞이지 않게)
    const u = Math.random().toString(36).slice(2, 8);
    await st.upsertUser({ id: `acc_1_${u}`, kind: "account", nickname: `회원1${u}` });
    await st.upsertUser({ id: `acc_2_${u}`, kind: "account", nickname: `회원2${u}` });
    const base = { gameId: "gomoku", reason: "normal", startedAt: new Date(), endedAt: new Date() };
    const players = [
      { userId: `acc_1_${u}`, seat: 0 as const, outcome: "win" as const, score: 1 },
      { userId: `acc_2_${u}`, seat: 1 as const, outcome: "loss" as const, score: 0 },
    ];
    await st.saveMatch({ ...base, id: `m_${Math.random()}`, mode: "friend", players });
    await st.saveMatch({ ...base, id: `m_${Math.random()}`, mode: "friend", players });
    await st.saveMatch({ ...base, id: `m_${Math.random()}`, mode: "random", players });
    const dupId = `m_${Math.random()}`;
    expect(await st.saveMatch({ ...base, id: dupId, mode: "random", players })).toBe(true);
    expect(await st.saveMatch({ ...base, id: dupId, mode: "random", players })).toBe(false); // 중복 저장 차단
    const lb = await st.getLeaderboard("gomoku", "wins", 1000);
    const me = lb.find((r) => r.nickname === `회원1${u}`);
    expect(me?.value).toBe(2); // 친구전 2승 제외, 랜덤 2승만
  });
});

describe("요청 속도 제한", () => {
  it("X-Forwarded-For 를 바꿔도 HTTP 속도 제한을 우회할 수 없다", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 25; i++) {
      const r = await fetch(`${srv.base}/api/guest`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${i}` },
        body: "{}",
      });
      codes.push(r.status);
    }
    expect(codes).toContain(429);
  });

  it("짧은 시간에 과도한 이벤트는 RATE_LIMITED", async () => {
    const a = await srv.client();
    const results = await Promise.all(Array.from({ length: 40 }, () => emit(a, "queue:leave", {})));
    expect(results.some((r) => r.error === "RATE_LIMITED")).toBe(true);
  });
});

describe("속도 제한 범위", () => {
  it("API 가 아닌 요청(페이지·정적 파일)은 속도 제한에 걸리지 않는다", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 320; i++) codes.push((await fetch(`${srv.base}/not-api-${i}`)).status);
    expect(codes).not.toContain(429);
  });
});
