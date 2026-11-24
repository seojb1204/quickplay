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
  saveMatch(m: MatchRecord): Promise<boolean>;
  saveSolo(r: SoloRecord): Promise<boolean>;
  getStats(userId: string): Promise<GameStatsRow[]>;
  getRecent(userId: string, limit: number): Promise<RecentRow[]>;
  /** 랭킹은 회원(account) 기록만 집계한다 */
  getLeaderboard(gameId: string, metric: "wins" | "best", limit: number): Promise<LeaderRow[]>;
  close(): Promise<void>;
}
