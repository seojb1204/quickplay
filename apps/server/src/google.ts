/**
 * 구글 로그인: 브라우저의 "Google 계정으로 로그인" 버튼이 준 ID 토큰을 서버가 검증한다.
 * - 구글 공개키로 서명 확인 + audience(우리 클라이언트 ID)·발급자·만료 확인 (google-auth-library)
 * - 저장하는 것은 구글 계정 고유번호(sub)뿐. 이메일·이름·사진은 저장하지 않는다(최소 수집).
 */
import { OAuth2Client } from "google-auth-library";

export interface GoogleIdentity {
  sub: string;
}

export type GoogleVerifier = (credential: string) => Promise<GoogleIdentity | null>;

export function createGoogleVerifier(clientId: string): GoogleVerifier {
  const client = new OAuth2Client(clientId);
  return async (credential) => {
    try {
      const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
      const p = ticket.getPayload();
      if (!p?.sub) return null;
      if (p.iss !== "accounts.google.com" && p.iss !== "https://accounts.google.com") return null;
      return { sub: p.sub };
    } catch {
      return null;
    }
  };
}
