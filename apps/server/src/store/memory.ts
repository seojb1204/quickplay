/** 개발·테스트용 메모리 저장소. 서버 재시작 시 기록이 사라진다. */
import type { GameStatsRow, LeaderRow, RecentRow } from "@qp/shared";
import type { MatchRecord, SoloRecord, Store, UserRow } from "./types.js";

export class MemoryStore implements Store {
  users = new Map<string, UserRow>();
  matches = new Map<string, MatchRecord>();
  solos = new Map<string, SoloRecord & { at: Date }>();
  googleSubs = new Map<string, string>();

  async findOrCreateGoogleUser(sub: string, nickname: string, newId: string): Promise<UserRow> {
    const existing = this.googleSubs.get(sub);
    if (existing) return { ...this.users.get(existing)! };
    const u: UserRow = { id: newId, kind: "account", nickname };
    this.users.set(newId, u);
    this.googleSubs.set(sub, newId);
    return { ...u };
  }

  async mergeGuestInto(guestId: string, accountId: string): Promise<number> {
    if (this.users.get(guestId)?.kind !== "guest") return 0;
    let n = 0;
    for (const m of this.matches.values()) {
      for (const p of m.players) {
        if (p.userId === guestId) {
          p.userId = accountId;
          n++;
        }
      }
    }
    for (const r of this.solos.values()) {
      if (r.userId === guestId) {
        r.userId = accountId;
        n++;
      }
    }
    return n;
  }

  async init() {}
  async close() {}

  async upsertUser(u: UserRow) {
    this.users.set(u.id, { ...u });
  }

  async ensureUser(u: UserRow) {
    if (!this.users.has(u.id)) this.users.set(u.id, { ...u });
  }

  async saveMatch(m: MatchRecord) {
    if (this.matches.has(m.id)) return false;
    this.matches.set(m.id, structuredClone(m));
    return true;
  }

  async saveSolo(r: SoloRecord) {
    if (this.solos.has(r.id)) return false;
    this.solos.set(r.id, { ...r, at: new Date() });
    return true;
  }

  async getStats(userId: string): Promise<GameStatsRow[]> {
    const by = new Map<string, GameStatsRow>();
    const row = (g: string) => {
      let r = by.get(g);
      if (!r) {
        r = { gameId: g, plays: 0, wins: 0, losses: 0, draws: 0, best: null };
        by.set(g, r);
      }
      return r;
    };
    for (const m of this.matches.values()) {
      const p = m.players.find((x) => x.userId === userId);
      if (!p || !p.outcome) continue;
      const r = row(m.gameId);
      r.plays++;
      if (p.outcome === "win") r.wins++;
      else if (p.outcome === "loss") r.losses++;
      else r.draws++;
    }
    for (const s of this.solos.values()) {
      if (s.userId !== userId || !s.verified) continue;
      const r = row(s.gameId);
      r.plays++;
      r.best = r.best === null ? s.score : Math.max(r.best, s.score);
    }
    return [...by.values()];
  }

  async getRecent(userId: string, limit: number): Promise<RecentRow[]> {
    const rows: RecentRow[] = [];
    for (const m of this.matches.values()) {
      const p = m.players.find((x) => x.userId === userId);
      if (!p) continue;
      rows.push({ gameId: m.gameId, mode: m.mode, outcome: p.outcome, score: p.score, reason: m.reason, at: m.endedAt.toISOString() });
    }
    for (const s of this.solos.values()) {
      if (s.userId !== userId) continue;
      rows.push({ gameId: s.gameId, mode: "solo", outcome: null, score: s.score, reason: "normal", at: s.at.toISOString() });
    }
    return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  }

  async getLeaderboard(gameId: string, metric: "wins" | "best", limit: number): Promise<LeaderRow[]> {
    const vals = new Map<string, number>();
    if (metric === "wins") {
      for (const m of this.matches.values()) {
        if (m.gameId !== gameId || m.mode !== "random") continue;
        for (const p of m.players) {
          if (p.outcome !== "win" || this.users.get(p.userId)?.kind !== "account") continue;
          vals.set(p.userId, (vals.get(p.userId) ?? 0) + 1);
        }
      }
    } else {
      for (const s of this.solos.values()) {
        if (s.gameId !== gameId || !s.verified || this.users.get(s.userId)?.kind !== "account") continue;
        vals.set(s.userId, Math.max(vals.get(s.userId) ?? 0, s.score));
      }
    }
    return [...vals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([uid, value], i) => ({ rank: i + 1, nickname: this.users.get(uid)?.nickname ?? "?", value }));
  }
}
