/**
 * 비회원(게스트) 세션: 서버가 HMAC 으로 서명한 토큰을 발급한다.
 * 토큰 = base64url(payload).base64url(hmac). payload = { uid, nick, iat }
 * 브라우저는 localStorage 에 보관. 위조하면 서명이 맞지 않아 거부된다.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface SessionUser {
  id: string;
  nickname: string;
  kind: "guest" | "account";
}

const ADJ = ["빠른", "용감한", "느긋한", "반짝이는", "졸린", "배고픈", "신나는", "조용한", "엉뚱한", "씩씩한"];
const NOUN = ["고양이", "펭귄", "여우", "수달", "다람쥐", "판다", "부엉이", "토끼", "고래", "너구리"];

export function randomNickname(): string {
  const b = randomBytes(3);
  return `${ADJ[b[0]! % ADJ.length]}${NOUN[b[1]! % NOUN.length]}${(b[2]! % 90) + 10}`;
}

const b64 = (buf: Buffer) => buf.toString("base64url");

export function signGuest(secret: string, user: { id: string; nickname: string }): string {
  const payload = b64(Buffer.from(JSON.stringify({ uid: user.id, nick: user.nickname, iat: Date.now() })));
  const sig = b64(createHmac("sha256", secret).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifyGuest(secret: string, token: unknown): SessionUser | null {
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
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { uid?: unknown; nick?: unknown };
    if (typeof data.uid !== "string" || typeof data.nick !== "string") return null;
    return { id: data.uid, nickname: data.nick, kind: "guest" };
  } catch {
    return null;
  }
}

export function newGuestId(): string {
  return `g_${randomBytes(12).toString("base64url")}`;
}
