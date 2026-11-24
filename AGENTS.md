# AI 에이전트 작업 지침 (Codex / Claude Code 공용)

작업 전 반드시 읽기: `docs/09-progress.md`, `docs/06-ai-dev-review-guide.md`, 해당 게임의 `docs/games/rules.md` 항목.

- 패키지 관리자: pnpm. 검사: `pnpm typecheck && pnpm lint && pnpm test` (+ 필요 시 `pnpm test:e2e`).
- 규칙은 `packages/shared` 에만 둔다. 서버와 웹이 같은 규칙 코드를 쓴다.
- 경쟁 결과는 서버가 판정한다. 클라이언트가 보낸 점수를 저장하지 않는다.
- 새 게임: shared 규칙 + 서버 모듈 + 웹 Solo/Versus + 두 등록부 + 테스트 + 진행 현황 갱신.
- 테스트 삭제·기준 완화로 통과시키기 금지. 같은 문제 자동 수정은 2회까지.
- 비밀키·토큰은 환경변수로만. 커밋·로그·PR 본문 금지.
- 작업을 끝내거나 중단할 때 `docs/09-progress.md` 에 완료/미완료/다음 작업을 남긴다.
