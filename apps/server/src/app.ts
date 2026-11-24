import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { Server } from "socket.io";
import {
  GAMES,
  SNAKE,
  getGame,
  simulateSnake,
  validateSnakeInputs,
  type ClientToServer,
  type GuestSession,
  type ServerToClient,
  type SnakeInput,
} from "@qp/shared";
import { newGuestId, randomNickname, signGuest, verifyGuest, type SessionUser } from "./auth.js";
import type { ServerConfig } from "./config.js";
import { Hub } from "./hub.js";
import type { Store } from "./store/types.js";

interface SoloSession {
  userId: string;
  gameId: string;
  seed: number;
  startedAt: number;
  used: boolean;
}

/** 서버에서 리플레이 검증이 가능한 솔로 기록 게임 */
const VERIFIED_SOLO = new Set(["snake"]);
const SOLO_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export function sanitizeNickname(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // 제어문자와 꺾쇠 제거(의도적인 제어문자 정규식)
  // eslint-disable-next-line no-control-regex
  const s = raw.normalize("NFC").replace(/[\u0000-\u001f\u007f<>]/g, "").trim();
  if ([...s].length < 2 || [...s].length > 12) return null;
  return s;
}

export async function buildApp(config: ServerConfig, store: Store) {
  const app: FastifyInstance = Fastify({
    logger: process.env.NODE_ENV === "test" ? false : { level: "info" },
    trustProxy: true,
    bodyLimit: 256 * 1024,
  });

  await app.register(cors, { origin: config.corsOrigins, credentials: false });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

  const authUser = (req: FastifyRequest): SessionUser | null => {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) return null;
    return verifyGuest(config.sessionSecret, h.slice(7));
  };

  const soloSessions = new Map<string, SoloSession>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of soloSessions) if (now - v.startedAt > SOLO_SESSION_TTL_MS) soloSessions.delete(k);
  }, 60_000);
  sweep.unref();

  app.get("/api/health", async () => ({ ok: true, time: Date.now() }));

  app.get("/api/games", async () => ({ games: GAMES }));

  // 비회원 세션 발급/닉네임 변경. 기존 토큰이 유효하면 같은 사용자 id 를 유지한다.
  app.post("/api/guest", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = (req.body ?? {}) as { token?: unknown; nickname?: unknown };
    const existing = verifyGuest(config.sessionSecret, body.token);
    let nickname = existing?.nickname ?? randomNickname();
    if (body.nickname !== undefined) {
      const n = sanitizeNickname(body.nickname);
      if (!n) return reply.code(400).send({ error: "BAD_NICKNAME", message: "닉네임은 2~12자" });
      nickname = n;
    }
    const id = existing?.id ?? newGuestId();
    await store.upsertUser({ id, kind: "guest", nickname });
    const session: GuestSession = { token: signGuest(config.sessionSecret, { id, nickname }), userId: id, nickname };
    return session;
  });

  app.get("/api/me/stats", async (req, reply) => {
    const u = authUser(req);
    if (!u) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const [stats, recent] = await Promise.all([store.getStats(u.id), store.getRecent(u.id, 20)]);
    return { user: { id: u.id, nickname: u.nickname, kind: u.kind }, stats, recent };
  });

  app.get<{ Params: { gameId: string } }>("/api/leaderboard/:gameId", async (req, reply) => {
    const g = getGame(req.params.gameId);
    if (!g) return reply.code(404).send({ error: "UNKNOWN_GAME" });
    const metric = g.kind === "record" ? "best" : "wins";
    return { gameId: g.id, metric, accountsOnly: true, rows: await store.getLeaderboard(g.id, metric, 50) };
  });

  // 솔로 기록: 시작 시 서버가 시드를 발급하고, 종료 시 입력 기록을 받아 서버가 직접 점수를 계산한다.
  app.post("/api/solo/start", async (req, reply) => {
    const u = authUser(req);
    if (!u) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const { gameId } = (req.body ?? {}) as { gameId?: unknown };
    if (typeof gameId !== "string" || !VERIFIED_SOLO.has(gameId)) return reply.code(400).send({ error: "UNKNOWN_GAME" });
    const sessionId = randomUUID();
    const seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
    soloSessions.set(sessionId, { userId: u.id, gameId, seed, startedAt: Date.now(), used: false });
    return { sessionId, seed };
  });

  app.post("/api/solo/finish", async (req, reply) => {
    const u = authUser(req);
    if (!u) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const { sessionId, inputs, endTick } = (req.body ?? {}) as { sessionId?: unknown; inputs?: unknown; endTick?: unknown };
    const sess = typeof sessionId === "string" ? soloSessions.get(sessionId) : undefined;
    if (!sess || sess.userId !== u.id) return reply.code(404).send({ error: "SESSION_NOT_FOUND" });
    if (sess.used) return reply.code(409).send({ error: "ALREADY_SUBMITTED" });
    if (typeof endTick !== "number" || !Number.isInteger(endTick) || endTick < 0 || endTick > SNAKE.SOLO_MAX_TICKS) {
      return reply.code(400).send({ error: "BAD_END_TICK" });
    }
    // 실제 흐른 시간보다 더 많이 플레이했다고 주장하면 거부(+3초 여유)
    const elapsed = Date.now() - sess.startedAt;
    if (endTick * SNAKE.TICK_MS > elapsed + 3_000) return reply.code(400).send({ error: "IMPLAUSIBLE_DURATION" });
    const check = validateSnakeInputs(inputs, endTick);
    if (!check.ok) return reply.code(400).send({ error: check.error });
    sess.used = true;
    const sim = simulateSnake(sess.seed, inputs as SnakeInput[], endTick);
    await store.upsertUser({ id: u.id, kind: u.kind, nickname: u.nickname });
    await store.saveSolo({ id: sessionId as string, userId: u.id, gameId: sess.gameId, score: sim.score, verified: true });
    const stats = await store.getStats(u.id);
    const best = stats.find((s) => s.gameId === sess.gameId)?.best ?? sim.score;
    return { score: sim.score, best };
  });

  if (config.webDist && existsSync(config.webDist)) {
    // wildcard: 요청 시점에 파일을 찾으므로 재빌드된 해시 파일도 제공됨
    await app.register(fastifyStatic, { root: config.webDist, wildcard: true });
    // SPA 라우팅: /api 가 아닌 모든 GET 은 index.html
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api") && !req.url.startsWith("/socket.io")) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "NOT_FOUND" });
    });
  }

  const io = new Server<ClientToServer, ServerToClient>(app.server, {
    cors: { origin: config.corsOrigins },
    maxHttpBufferSize: 64 * 1024,
    pingInterval: 10_000,
    pingTimeout: 8_000,
  });

  const hub = new Hub(io, store, {
    reconnectGraceMs: config.reconnectGraceMs,
    countdownMs: config.countdownMs,
    log: (msg, extra) => app.log.warn({ ...extra }, msg),
  });

  io.use((socket, next) => {
    const user = verifyGuest(config.sessionSecret, socket.handshake.auth?.token);
    if (!user) return next(new Error("UNAUTHORIZED"));
    socket.data.user = user;
    next();
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as SessionUser;
    void store.upsertUser({ id: user.id, kind: user.kind, nickname: user.nickname }).catch(() => {});
    hub.attach(socket, user);
  });

  app.addHook("onClose", async () => {
    hub.shutdown();
    clearInterval(sweep);
    io.close();
  });

  return { app, io, hub };
}
