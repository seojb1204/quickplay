import type { GuestSession } from "@qp/shared";

/** 프론트와 서버가 다른 주소에 배포될 때 VITE_API_URL 로 서버 주소 지정. 비우면 같은 출처 */
export const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

const KEY = "qp_session_v1";

function readStored(): GuestSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GuestSession) : null;
  } catch {
    return null;
  }
}

function store(s: GuestSession) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 사생활 보호 모드 등: 이번 탭에서만 유지 */
  }
}

let current: GuestSession | null = null;
let pending: Promise<GuestSession> | null = null;
/** 회원 로그인이 만료되어 비회원으로 돌아왔는지(화면 안내용) */
export let loginExpired = false;

/** 비회원 세션을 확보한다. 저장된 토큰이 있으면 서버에서 재확인(서명 키가 바뀌었으면 새로 발급). */
export function ensureSession(): Promise<GuestSession> {
  if (current) return Promise.resolve(current);
  if (pending) return pending;
  pending = (async () => {
    const saved = readStored();
    const r = await fetch(`${API_BASE}/api/guest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: saved?.token }),
    });
    if (!r.ok) throw new Error(`세션 발급 실패 (${r.status})`);
    const s = (await r.json()) as GuestSession & { expired?: boolean };
    loginExpired = saved?.kind === "account" && s.kind === "guest";
    current = { token: s.token, userId: s.userId, nickname: s.nickname, kind: s.kind };
    store(current);
    return current;
  })().finally(() => {
    pending = null;
  });
  return pending;
}

export async function renameGuest(nickname: string): Promise<GuestSession> {
  const s = await ensureSession();
  const r = await fetch(`${API_BASE}/api/guest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: s.token, nickname }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.message ?? "닉네임 변경 실패");
  current = body as GuestSession;
  store(current);
  return current;
}

export async function apiGet<T>(path: string): Promise<T> {
  const s = await ensureSession();
  const r = await fetch(`${API_BASE}${path}`, { headers: { authorization: `Bearer ${s.token}` } });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return (await r.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const s = await ensureSession();
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${s.token}` },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error ?? `${path} ${r.status}`);
  return data as T;
}

export interface PublicConfig {
  googleClientId: string | null;
}

let configPromise: Promise<PublicConfig> | null = null;
export function getConfig(): Promise<PublicConfig> {
  configPromise ??= fetch(`${API_BASE}/api/config`)
    .then((r) => (r.ok ? (r.json() as Promise<PublicConfig>) : { googleClientId: null }))
    .catch(() => ({ googleClientId: null }));
  return configPromise;
}

/** 구글 ID 토큰을 서버에 보내 회원 세션을 받는다. 지금 브라우저의 비회원 기록은 회원으로 옮겨진다. */
export async function loginWithGoogle(credential: string): Promise<{ merged: number }> {
  const s = await ensureSession();
  const r = await fetch(`${API_BASE}/api/auth/google`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credential, token: s.token }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `로그인 실패 (${r.status})`);
  const next = body as GuestSession & { merged: number };
  current = { token: next.token, userId: next.userId, nickname: next.nickname, kind: next.kind };
  store(current);
  return { merged: next.merged };
}

/** 로그아웃: 이 브라우저의 토큰을 지우고 새 비회원으로 시작 */
export function logout() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 무시 */
  }
  current = null;
}
