/** PostgreSQL 저장소 (Neon 등). 스키마는 schema.sql — 시작 시 멱등 적용 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type { GameStatsRow, LeaderRow, RecentRow } from "@qp/shared";
import type { MatchRecord, SoloRecord, Store, UserRow } from "./types.js";

const SCHEMA = readFileSync(fileURLToPath(new URL("./schema.sql", import.meta.url)), "utf8");

export class PostgresStore implements Store {
  private pool: pg.Pool;
  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url, max: 5 });
  }

  async init() {
    await this.pool.query(SCHEMA);
  }

  async close() {
    await this.pool.end();
  }

  async upsertUser(u: UserRow) {
    await this.pool.query(
      `insert into users (id, kind, nickname) values ($1,$2,$3)
       on conflict (id) do update set nickname = excluded.nickname`,
      [u.id, u.kind, u.nickname],
    );
  }

  async ensureUser(u: UserRow) {
    await this.pool.query(`insert into users (id, kind, nickname) values ($1,$2,$3) on conflict (id) do nothing`, [u.id, u.kind, u.nickname]);
  }

  async findOrCreateGoogleUser(sub: string, nickname: string, newId: string): Promise<UserRow> {
    // 동시에 두 번 로그인해도 한 명만 생기도록 고유 인덱스 + on conflict
    await this.pool.query(
      `insert into users (id, kind, nickname, google_sub) values ($1,'account',$2,$3) on conflict (google_sub) do nothing`,
      [newId, nickname, sub],
    );
    const r = await this.pool.query(`select id, kind, nickname from users where google_sub = $1`, [sub]);
    return r.rows[0] as UserRow;
  }

  async mergeGuestInto(guestId: string, accountId: string): Promise<number> {
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      const g = await c.query(`select kind from users where id = $1 for update`, [guestId]);
      if (g.rows[0]?.kind !== "guest") {
        await c.query("rollback");
        return 0;
      }
      const a = await c.query(`update match_players set user_id = $2 where user_id = $1`, [guestId, accountId]);
      const b = await c.query(`update solo_records set user_id = $2 where user_id = $1`, [guestId, accountId]);
      await c.query("commit");
      return (a.rowCount ?? 0) + (b.rowCount ?? 0);
    } catch (e) {
      await c.query("rollback").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }

  async saveMatch(m: MatchRecord) {
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      const r = await c.query(
        `insert into matches (id, game_id, mode, reason, started_at, ended_at)
         values ($1,$2,$3,$4,$5,$6) on conflict (id) do nothing`,
        [m.id, m.gameId, m.mode, m.reason, m.startedAt, m.endedAt],
      );
      if (r.rowCount === 0) {
        await c.query("rollback");
        return false;
      }
      for (const p of m.players) {
        await c.query(
          `insert into match_players (match_id, user_id, seat, outcome, score) values ($1,$2,$3,$4,$5)`,
          [m.id, p.userId, p.seat, p.outcome, p.score],
        );
      }
      await c.query("commit");
      return true;
    } catch (e) {
      await c.query("rollback").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }

  async saveSolo(r: SoloRecord) {
    const res = await this.pool.query(
      `insert into solo_records (id, user_id, game_id, score, verified) values ($1,$2,$3,$4,$5)
       on conflict (id) do nothing`,
      [r.id, r.userId, r.gameId, r.score, r.verified],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async getStats(userId: string): Promise<GameStatsRow[]> {
    const res = await this.pool.query(
      `with v as (
         select m.game_id, mp.outcome, null::int as score
           from match_players mp join matches m on m.id = mp.match_id
          where mp.user_id = $1 and mp.outcome is not null
         union all
         select game_id, null, score from solo_records where user_id = $1 and verified
       )
       select game_id,
              count(*)::int as plays,
              count(*) filter (where outcome = 'win')::int as wins,
              count(*) filter (where outcome = 'loss')::int as losses,
              count(*) filter (where outcome = 'draw')::int as draws,
              max(score) as best
         from v group by game_id`,
      [userId],
    );
    return res.rows.map((r) => ({
      gameId: r.game_id,
      plays: r.plays,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      best: r.best === null ? null : Number(r.best),
    }));
  }

  async getRecent(userId: string, limit: number): Promise<RecentRow[]> {
    const res = await this.pool.query(
      `select * from (
         select m.game_id, m.mode, mp.outcome, mp.score, m.reason, m.ended_at as at
           from match_players mp join matches m on m.id = mp.match_id where mp.user_id = $1
         union all
         select game_id, 'solo', null, score, 'normal', created_at from solo_records where user_id = $1
       ) t order by at desc limit $2`,
      [userId, limit],
    );
    return res.rows.map((r) => ({
      gameId: r.game_id,
      mode: r.mode,
      outcome: r.outcome,
      score: r.score,
      reason: r.reason,
      at: new Date(r.at).toISOString(),
    }));
  }

  async getLeaderboard(gameId: string, metric: "wins" | "best", limit: number): Promise<LeaderRow[]> {
    const sql =
      metric === "wins"
        ? `select u.nickname, count(*)::int as value
             from match_players mp join matches m on m.id = mp.match_id join users u on u.id = mp.user_id
            where m.game_id = $1 and m.mode = 'random' and mp.outcome = 'win' and u.kind = 'account'
            group by u.id, u.nickname order by value desc limit $2`
        : `select u.nickname, max(s.score)::int as value
             from solo_records s join users u on u.id = s.user_id
            where s.game_id = $1 and s.verified and u.kind = 'account'
            group by u.id, u.nickname order by value desc limit $2`;
    const res = await this.pool.query(sql, [gameId, limit]);
    return res.rows.map((r, i) => ({ rank: i + 1, nickname: r.nickname, value: r.value }));
  }
}
