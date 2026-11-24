-- QuickPlay 스키마 v1 (멱등). 변경 시 docs/05-database.md 도 갱신할 것.
create table if not exists users (
  id          text primary key,
  kind        text not null check (kind in ('guest', 'account')),
  nickname    text not null,
  created_at  timestamptz not null default now()
);

create table if not exists matches (
  id          text primary key,
  game_id     text not null,
  mode        text not null check (mode in ('friend', 'random')),
  reason      text not null,
  started_at  timestamptz not null,
  ended_at    timestamptz not null
);

create table if not exists match_players (
  match_id  text not null references matches(id) on delete cascade,
  user_id   text not null references users(id),
  seat      smallint not null check (seat in (0, 1)),
  outcome   text check (outcome in ('win', 'loss', 'draw')),
  score     integer not null default 0,
  primary key (match_id, seat)
);
create index if not exists match_players_user_idx on match_players(user_id);

create table if not exists solo_records (
  id          text primary key,
  user_id     text not null references users(id),
  game_id     text not null,
  score       integer not null,
  verified    boolean not null,
  created_at  timestamptz not null default now()
);
create index if not exists solo_records_game_idx on solo_records(game_id, score desc);
create index if not exists solo_records_user_idx on solo_records(user_id);

-- v2: 구글 로그인(계정 고유번호만 저장)
alter table users add column if not exists google_sub text;
create unique index if not exists users_google_sub_idx on users(google_sub);
