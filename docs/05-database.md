# 데이터베이스 구조 v1

원본: `apps/server/src/store/schema.sql` (서버 시작 시 멱등 적용)

| 테이블 | 주요 열 | 비고 |
|---|---|---|
| users | id, kind(guest/account), nickname, google_sub(고유) | 개인정보: 닉네임 + 구글 계정 고유번호. 이메일·이름 저장 안 함 |
| matches | id(UUID), game_id, mode, reason, started_at, ended_at | id 기본키 + `on conflict do nothing` → 중복 저장 차단 |
| match_players | match_id, user_id, seat, outcome, score | outcome null = 기록 없는 종료 |
| solo_records | id(=솔로 세션 id), user_id, game_id, score, verified | 세션당 1회만 저장 |

- 매 프레임 기록 없음: 경기당 1회 + 솔로 1회만 쓴다.
- 미구현: 마이그레이션 도구(현재 멱등 SQL 1개), 오래된 게스트 정리 정책, 백업 확인 절차(12-deploy-recovery.md).
