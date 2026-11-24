import { useEffect, useRef, useState } from "react";
import { getConfig, loginWithGoogle } from "../lib/api";

interface GoogleIdApi {
  initialize(o: { client_id: string; callback: (r: { credential: string }) => void }): void;
  renderButton(el: HTMLElement, o: Record<string, unknown>): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

const SCRIPT = "https://accounts.google.com/gsi/client";

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector(`script[src="${SCRIPT}"]`);
    const el = existing ?? Object.assign(document.createElement("script"), { src: SCRIPT, async: true, defer: true });
    el.addEventListener("load", () => resolve());
    el.addEventListener("error", () => reject(new Error("구글 로그인 스크립트를 불러오지 못했어요")));
    if (!existing) document.head.appendChild(el);
  });
}

/** "Google 계정으로 로그인" 공식 버튼. 서버에 클라이언트 ID 가 없으면 안내만 표시 */
export function GoogleLoginButton() {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "disabled" | "busy" | "error">("loading");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getConfig().then(async (cfg) => {
      if (!alive) return;
      if (!cfg.googleClientId) {
        setState("disabled");
        return;
      }
      try {
        await loadScript();
        if (!alive || !box.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: cfg.googleClientId,
          callback: async ({ credential }) => {
            setState("busy");
            try {
              await loginWithGoogle(credential);
              // 실시간 연결을 회원 토큰으로 다시 맺기 위해 새로고침
              location.reload();
            } catch (e) {
              setState("error");
              setMsg((e as Error).message);
            }
          },
        });
        window.google.accounts.id.renderButton(box.current, {
          theme: "outline",
          size: "large",
          text: "signin_with",
          locale: "ko",
          shape: "pill",
        });
        setState("ready");
      } catch (e) {
        setState("error");
        setMsg((e as Error).message);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  if (state === "disabled") return <p className="muted small" data-testid="login-disabled">로그인 기능 준비 중이에요.</p>;
  return (
    <div className="stack small-gap">
      <div ref={box} data-testid="google-login" />
      {state === "busy" && <p className="muted small">로그인 중…</p>}
      {msg && <p className="danger small">{msg}</p>}
    </div>
  );
}
