/** 통합 테스트 도우미: 실제 서버를 임의 포트로 띄우고 실제 Socket.IO 클라이언트로 접속한다. */
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import type { ClientToServer, GuestSession, MatchResult, MatchStart, RoomView, ServerToClient } from "@qp/shared";
import { buildApp } from "./app.js";
import { loadConfig, type ServerConfig } from "./config.js";
import { MemoryStore } from "./store/memory.js";
import { PostgresStore } from "./store/postgres.js";
import type { Store } from "./store/types.js";

export type Client = Socket<ServerToClient, ClientToServer> & {
  session: GuestSession;
  last: { room: RoomView | null; start: MatchStart | null; state: unknown; end: MatchResult | null };
};

export async function startServer(overrides: Partial<ServerConfig> = {}) {
  const config = { ...loadConfig({ NODE_ENV: "test" }), port: 0, host: "127.0.0.1", countdownMs: 200, reconnectGraceMs: 400, ...overrides };
  const pgUrl = process.env.TEST_DATABASE_URL;
  const store: Store = pgUrl ? new PostgresStore(pgUrl) : new MemoryStore();
  await store.init();
  const { app, hub } = await buildApp(config, store);
  await app.listen({ port: 0, host: "127.0.0.1" });
  const port = (app.server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  const clients: Client[] = [];

  const guest = async (nickname?: string, token?: string): Promise<GuestSession> => {
    const r = await fetch(`${base}/api/guest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nickname, token }),
    });
    if (!r.ok) throw new Error(`guest ${r.status}`);
    return (await r.json()) as GuestSession;
  };

  const client = async (nickname?: string, session?: GuestSession): Promise<Client> => {
    const s = session ?? (await guest(nickname));
    const sock = connect(base, { auth: { token: s.token }, transports: ["websocket"], reconnection: false, forceNew: true }) as Client;
    sock.session = s;
    sock.last = { room: null, start: null, state: null, end: null };
    sock.on("room:state", (r) => (sock.last.room = r));
    sock.on("match:start", (m) => {
      sock.last.start = m;
      sock.last.end = null;
    });
    sock.on("match:state", (st) => (sock.last.state = st));
    sock.on("match:end", (e) => (sock.last.end = e));
    await new Promise<void>((res, rej) => {
      sock.once("connect", () => res());
      sock.once("connect_error", (e) => rej(e));
    });
    clients.push(sock);
    return sock;
  };

  const close = async () => {
    for (const c of clients) c.disconnect();
    await app.close();
    await store.close();
  };

  return { app, hub, store, base, port, guest, client, close };
}

export function emit<T = { ok: boolean; error?: string }>(c: Client, ev: keyof ClientToServer, payload: object = {}): Promise<T> {
  return new Promise((res) => (c.emit as (e: string, p: object, cb: (r: T) => void) => void)(ev, payload, res));
}

export async function waitFor<T>(fn: () => T | null | undefined | false, ms = 5000, label = "condition"): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
