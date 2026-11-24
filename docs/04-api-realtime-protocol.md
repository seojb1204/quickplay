# API 및 실시간 통신 규약 v1

자료형 원본: `packages/shared/src/protocol.ts`

## HTTP
| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| GET | /api/health | - | 상태 확인 |
| GET | /api/games | - | 게임 카탈로그 |
| POST | /api/guest | - | `{token?, nickname?}` → `{token, userId, nickname}` 비회원 토큰 발급·닉네임 변경 |
| GET | /api/me/stats | Bearer | 게임별 통계 + 최근 20판 |
| GET | /api/leaderboard/:gameId | - | 회원만 집계. 기록 경쟁 = 최고점, 대전 = 승수 |
| POST | /api/solo/start | Bearer | `{gameId}` → `{sessionId, seed}` (현재 snake 만) |
| POST | /api/solo/finish | Bearer | `{sessionId, inputs, endTick}` → `{score, best}` 서버 재생 점수 |

제한: 전역 IP당 분당 120회, /api/guest 분당 20회.

## Socket.IO (접속 시 `auth.token` 필수)
클라이언트 → 서버 (모두 ack 콜백으로 `{ok:true,...}` 또는 `{ok:false,error}`)
| 이벤트 | 내용 |
|---|---|
| room:create `{gameId?}` | 친구방 생성 → `{code}` (6자리, 혼동 문자 제외) |
| room:join `{code}` | 대소문자 무관. ROOM_NOT_FOUND / ROOM_FULL / ALREADY_IN_ROOM |
| room:leave | 경기 중이면 랜덤=기권패, 친구=기록 없이 종료 |
| room:selectGame `{gameId}` | 친구방만, 경기 중 불가 |
| room:ready `{ready}` | 두 명 모두 준비 → 경기 시작 |
| queue:join `{gameId}` / queue:leave | 랜덤 대기 |
| match:action `{type, data}` | 게임별: paddle `input{dir}`, gomoku `move{index}`, snake `inputs{inputs,upTo,done}` |
| match:forfeit | 기권 |

서버 → 클라이언트: `room:state`, `queue:status`, `match:start{matchId,gameId,seat,seed,startAt,serverNow}`, `match:state`, `match:end{MatchResult}`, `session:replaced`

이벤트 속도 제한: 일반 초당 10(순간 20), match:action 초당 40(순간 80).
