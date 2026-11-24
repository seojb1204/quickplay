# QuickPlay (가칭)

설치 없이 PC·모바일 웹에서 바로 즐기는 1:1 미니게임 플랫폼. 혼자 · 친구와 · 랜덤 상대와.

## 현재 상태 (2026-11-24)
| 게임 | 솔로 | 친구 1:1 | 랜덤 1:1 | 자동 테스트 |
|---|---|---|---|---|
| 패들 랠리 (실시간) | ✅ AI | ✅ | ✅ | 규칙·서버·E2E |
| 오목 (턴제) | ✅ AI | ✅ | ✅ | 규칙·서버·E2E |
| 꼬리잡기 뱀 (기록 경쟁) | ✅ 서버 검증 기록 | ✅ | ✅ | 규칙·서버·E2E |
| 나머지 17종 | 규칙 초안만 (`docs/games/rules.md`) | | | |

자세한 현황·남은 작업: [`docs/09-progress.md`](docs/09-progress.md)

## 실행
```bash
pnpm install
pnpm --filter @qp/server dev     # 서버 :8787 (DATABASE_URL 없으면 메모리 저장)
pnpm --filter @qp/web dev        # 웹 :5173
```

## 검사
```bash
pnpm typecheck && pnpm lint
pnpm test                                    # 규칙 + 서버 통합 테스트
TEST_DATABASE_URL=postgres://... pnpm test   # PostgreSQL 저장소로 같은 테스트
CHROME_PATH=/path/to/chrome pnpm test:e2e     # 브라우저 2개 대전 + 모바일 에뮬레이션
```

## 구조
`packages/shared`(규칙·통신 자료형) · `apps/server`(Fastify + Socket.IO) · `apps/web`(React + Vite) · `e2e`(Playwright) · `docs`(문서)

## 문서
PRD · 정책/미결 · 아키텍처 · 통신 규약 · DB · AI 개발 지침 · 테스트 결과 · UI 방향 · 진행 현황 · 비용 · 보안 검토 · 배포/복구 — [`docs/`](docs)
