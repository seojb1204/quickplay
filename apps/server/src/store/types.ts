import type { GameStatsRow, LeaderRow, Outcome, RecentRow } from "@qp/shared";

export interface MatchRecord {
  id: string;
  gameId: string;
  mode: "friend" | "random";
  reason: string;
  startedAt: Date;
  endedAt: Date;
  players: Array<{ userId: string; seat: 0 | 1; outcome: Outcome | null; score: number }>;
}

export interface SoloRecord {
  id: string;
  userId: string;
  gameId: string;
  score: number;
  verified: boolean;
}

export interface UserRow {
  id: string;
  kind: "guest" | "account";
  nickname: string;
}

/**
 * 결과 저장소. 같은 id 로 두 번 저장하면 false 를 돌려주고 아무것도 바꾸지 않는다(중복 저장 방지).
 */
export interface Store {
  init(): Promise<void>;
  upsertUser(u: UserRow): Promise<void>;
  /** 없을 때만 생성(닉네임 덮어쓰지 않음) */
  ensureUser(u: UserRow): Promise<void>;
  saveMatch(m: MatchRecord): Promise<boolean>;
  saveSolo(r: SoloRecord): Promise<boolean>;
  getStats(userId: string): Promise<GameStatsRow[]>;
  getRecent(userId: string, limit: number): Promise<RecentRow[]>;
  /** 랭킹은 회원(account) 기록만, 승수는 랜덤 대전만 집계한다(친구끼리 승수 몰아주기 방지) */
  getLeaderboard(gameId: string, metric: "wins" | "best", limit: number): Promise<LeaderRow[]>;
  /** 구글 계정 고유번호로 회원을 찾고, 없으면 만든다 */
  findOrCreateGoogleUser(sub: string, nickname: string, newId: string): Promise<UserRow>;
  /** 비회원 기록(대전·솔로)을 회원에게 옮긴다. 옮긴 기록 수를 돌려준다 */
  mergeGuestInto(guestId: string, accountId: string): Promise<number>;
  close(): Promise<void>;
}
