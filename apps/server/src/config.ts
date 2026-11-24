export interface ServerConfig {
  port: number;
  host: string;
  /** 비회원 토큰 서명 키. 운영에서는 반드시 환경변수로 지정 */
  sessionSecret: string;
  databaseUrl: string | null;
  /** 허용할 웹 출처(쉼표 구분). 비우면 같은 출처만 */
  corsOrigins: string[];
  /** 빌드된 웹 파일 경로(있으면 서버가 같이 제공) */
  webDist: string | null;
  /** 테스트에서 시간 단축용 */
  reconnectGraceMs: number;
  countdownMs: number;
  gomokuTurnMs: number;
  /** 앞단 프록시 개수(Render 1). 0 이면 X-Forwarded-For 를 믿지 않음 */
  trustProxyHops: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const isProd = env.NODE_ENV === "production";
  const secret = env.SESSION_SECRET ?? "";
  if (isProd && secret.length < 32) {
    throw new Error("SESSION_SECRET(32자 이상)가 운영 환경에 설정되지 않았습니다.");
  }
  return {
    port: Number(env.PORT ?? 8787),
    host: env.HOST ?? "0.0.0.0",
    sessionSecret: secret || "dev-only-secret-do-not-use-in-production-000",
    databaseUrl: env.DATABASE_URL || null,
    corsOrigins: (env.CORS_ORIGINS ?? "http://localhost:5173")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    webDist: env.WEB_DIST || null,
    reconnectGraceMs: Number(env.RECONNECT_GRACE_MS ?? 15_000),
    countdownMs: Number(env.COUNTDOWN_MS ?? 3_000),
    gomokuTurnMs: Number(env.GOMOKU_TURN_MS ?? 30_000),
    trustProxyHops: Number(env.TRUST_PROXY_HOPS ?? 0),
  };
}
