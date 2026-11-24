# 배포·복구 절차

## 로컬 실행
```bash
pnpm install
pnpm --filter @qp/server dev        # http://localhost:8787
pnpm --filter @qp/web dev           # http://localhost:5173 (API 프록시)
```

## 현재 스테이징 (2026-11-25)
- Render Blueprint `quickplay` → 웹 서비스 `quickplay-staging`(Free), DB `quickplay-db`(Free PostgreSQL), 지역 singapore
- main 에 병합되면 자동 배포(autoDeploy)
- 비밀값: SESSION_SECRET 은 Render 가 생성, DATABASE_URL 은 DB 에서 자동 연결 — 사람이 입력한 비밀값 없음
- GOOGLE_CLIENT_ID: Render 대시보드 > quickplay-staging > Environment 에서 설정(공개값)

## 스테이징 배포 (사용자 승인 필요 단계 표시 ⚠️)
1. ⚠️ Render 가입 → New > Blueprint → 이 저장소 선택 → `render.yaml` 적용(Free).
2. ⚠️ (선택) Neon 무료 프로젝트 생성 → 연결 문자열을 Render 의 `DATABASE_URL` 에 입력. 비우면 메모리 저장.
3. `CORS_ORIGINS` 에 배포 주소 입력(같은 출처면 해당 주소 1개).
4. 배포 후 확인: `/api/health` 200, PC·휴대폰 각각 접속해 친구방 1판.

## 롤백
- Render 대시보드 Deploys → 이전 배포 "Rollback"(무료는 최근 2개까지).
- DB 스키마는 현재 추가만 하는 멱등 SQL → 롤백 시 스키마 되돌림 불필요.

## 장애 시
| 증상 | 확인 | 조치 |
|---|---|---|
| 첫 접속이 매우 느림 | Free 플랜 잠듦 | 정상(최대 약 1분). 정식은 Starter |
| 기록이 사라짐 | DATABASE_URL 비어 있음 | Neon 연결 |
| 소켓 연결 실패 | CORS_ORIGINS, 프록시 | 배포 주소와 일치시키기 |
| 진행 중 경기 사라짐 | 서버 재시작(배포 포함) | 단일 서버 구조의 알려진 한계 — 배포는 이용 적은 시간에 |

## 데이터 백업
Neon 은 시점 복구(플랜별 보존 기간) 제공 — 정식 공개 전 복구 연습 1회 필요(미실시).
