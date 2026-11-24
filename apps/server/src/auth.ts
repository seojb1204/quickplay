/**
 * 세션 토큰: 서버가 HMAC 으로 서명한 토큰. 비회원(guest)과 구글 로그인 회원(account) 공용.
 * 토큰 = base64url(payload).base64url(hmac). payload = { uid, nick, k, iat, exp? }
 * - 브라우저는 localStorage 에 보관. 위조·변조하면 서명이 맞지 않아 거부된다.
 * - 회원 토큰은 30일 만료(exp). 비회원 토큰은 만료 없음(기기에 묶인 익명 기록).
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type UserKind = "guest" | "account";

export interface SessionUser {
  id: string;
  nickname: string;
  kind: UserKind;
}

export const ACCOUNT_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const ADJ = ["빠른", "용감한", "느긋한", "반짝이는", "졸린", "배고픈", "신나는", "조용한", "엉뚱한", "씩씩한"];
const NOUN = ["고양이", "펭귄", "여우", "수달", "다람쥐", "판다", "부엉이", "토끼", "고래", "너구리"];

export function randomNickname(): string {
  const b = randomBytes(3);
  return `${ADJ[b[0]! % ADJ.length]}${NOUN[b[1]! % NOUN.length]}${(b[2]! % 90) + 10}`;
}

const b64 = (buf: Buffer) => buf.toString("base64url");

export function signSession(secret: string, user: SessionUser, now = Date.now()): string {
  const body: Record<string, unknown> = { uid: user.id, nick: user.nickname, k: user.kind, iat: now };
  if (user.kind === "account") body.exp = now + ACCOUNT_TOKEN_TTL_MS;
  const payload = b64(Buffer.from(JSON.stringify(body)));
  const sig = b64(createHmac("sha256", secret).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifySession(secret: string, token: unknown, now = Date.now()): SessionUser | null {
  if (typeof token !== "string" || token.length > 512) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  let given: Buffer;
  try {
    given = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      uid?: unknown;
      nick?: unknown;
      k?: unknown;
      exp?: unknown;
    };
    if (typeof data.uid !== "string" || typeof data.nick !== "string") return null;
    if (typeof data.exp === "number" && data.exp < now) return null;
    const kind: UserKind = data.k === "account" ? "account" : "guest";
    // 회원 토큰은 반드시 만료 시각이 있어야 한다
    if (kind === "account" && typeof data.exp !== "number") return null;
    return { id: data.uid, nickname: data.nick, kind };
  } catch {
    return null;
  }
}

export function newGuestId(): string {
  return `g_${randomBytes(12).toString("base64url")}`;
}

export function newAccountId(): string {
  return `a_${randomBytes(12).toString("base64url")}`;
}
