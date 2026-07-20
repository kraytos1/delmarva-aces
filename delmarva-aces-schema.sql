-- ============================================================
-- DELMARVA ACES · SUPABASE SCHEMA
-- Paste this entire file into Supabase → SQL Editor → Run
-- ============================================================


-- ── TEAMS ──────────────────────────────────────────────────
create table teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  short_name  text,
  age_group   text,
  division    text,
  season_year int  default 2026,
  created_at  timestamptz default now()
);


-- ── PLAYERS ────────────────────────────────────────────────
create table players (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid references teams(id) on delete cascade,
  jersey_num  int  not null,
  first_name  text not null,
  last_name   text not null,
  positions   text[],           -- e.g. ARRAY['P','1B']
  bats        text,             -- 'R' or 'L'
  throws      text,             -- 'R' or 'L'
  grad_year   int,              -- 2032
  top_velo    int,              -- mph, updated each game
  active      boolean default true,
  photo_url   text,             -- parent-uploaded profile photo (Supabase Storage 'player-photos' bucket)
  created_at  timestamptz default now()
);
-- Profile photos: public 'player-photos' bucket + open anon read/insert/update on
-- storage.objects; players.photo_url writable by anon ONLY (column grant), so parents
-- can set a photo with no PIN but cannot edit any other player field.
--   insert into storage.buckets(id,name,public) values('player-photos','player-photos',true);
--   grant update (photo_url) on players to anon;  -- (revoke update on players from anon first)
--   create policy players_photo_update on players for update to anon using(true) with check(true);


-- ── OPPONENTS ──────────────────────────────────────────────
create table opponents (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  short_name text
);


-- ── GAMES ──────────────────────────────────────────────────
create table games (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid references teams(id) on delete cascade,
  opponent_id       uuid references opponents(id),
  game_date         date not null,
  game_time         time,
  location          text,
  tournament        text,
  is_home           boolean default true,
  our_score         int  default 0,
  opp_score         int  default 0,
  status            text default 'scheduled',
  -- status: 'scheduled' | 'live' | 'final'
  season            text,  -- 'spring2026' | 'fall2026' | ... ; set by lineup.html from ACES_CONFIG.activeSeason. Separates archived vs live season data.
  youtube_url       text,
  youtube_stream_id text,
  stream_start_utc  timestamptz,   -- for clip offset math
  inning            int  default 1,
  half              text default 'top',
  outs              int  default 0,
  created_at        timestamptz default now()
);


-- ── AT BATS ────────────────────────────────────────────────
create table at_bats (
  id           uuid primary key default gen_random_uuid(),
  game_id      uuid references games(id) on delete cascade,
  batter_id    uuid references players(id),   -- our batter (set only when we bat / top half)
  aces_pitcher_id uuid references players(id),-- our pitcher (set only when we pitch / bottom half); powers pitching highlights
  pitcher_name text,             -- opponent pitcher (free text)
  inning       int  not null,
  half         text not null,    -- 'top' | 'bottom'
  ab_num       int,
  balls        int  default 0,
  strikes      int  default 0,
  result       text,
  -- result options:
  -- 'single' | 'double' | 'triple' | 'home_run'
  -- 'walk' | 'hbp' | 'intentional_walk'
  -- 'strikeout_looking' | 'strikeout_swinging'
  -- 'groundout' | 'flyout' | 'lineout' | 'popout'
  -- 'fielders_choice' | 'error' | 'sac_fly' | 'sac_bunt'
  -- 'double_play' | 'dropped_third'
  rbi          int  default 0,
  runs_scored  int  default 0,
  notes        text,
  yt_offset_sec int,             -- seconds into stream when AB ended
  clip_url      text,            -- Cloudflare R2 URL after processing
  clip_status   text default 'none',
  -- clip_status: 'none' | 'queued' | 'ready'
  created_at    timestamptz default now()
);


-- ── PITCHES ────────────────────────────────────────────────
create table pitches (
  id             uuid primary key default gen_random_uuid(),
  at_bat_id      uuid references at_bats(id) on delete cascade,
  game_id        uuid references games(id) on delete cascade,
  pitcher_id     uuid references players(id),
  -- pitcher_id only set when OUR player is pitching
  pitch_num      int  not null,  -- 1st pitch of AB, 2nd, etc.
  pitch_type     text,           -- 'FB' | 'CB' | 'SL' | 'CH'
  velocity_mph   int,            -- e.g. 67
  result         text,
  -- result: 'ball' | 'strike_called' | 'strike_swinging'
  --         'foul' | 'in_play'
  inning         int,
  half           text,
  balls_before   int,            -- count before this pitch
  strikes_before int,
  yt_offset_sec  int,            -- stream offset when pitch logged
  created_at     timestamptz default now()
);


-- ============================================================
-- VIEWS  (pre-built queries your website calls constantly)
-- ============================================================

-- Season batting stats per player (auto-calculated).
-- One row per player PER SEASON (games.season) — pages filter to the active
-- season client-side; a player with no at_bats gets a single null-season row.
-- Baserunner-only events are excluded from at_bats: the scorer stamps them
-- with the AT-PLATE batter's id, so counting them would add phantom 0-fers.
create view player_season_stats as
select
  p.id,
  p.jersey_num,
  p.first_name,
  p.last_name,
  p.positions,
  p.top_velo,
  count(distinct ab.game_id)                              as games_played,
  count(ab.id) filter (where ab.result not in
    ('walk','hbp','intentional_walk','sac_fly','sac_bunt',
     'stolen_base','wp_advance','pb_advance','balk_advance',
     'caught_stealing','pickoff_1b','pickoff_2b','pickoff_3b',
     'out_advancing'))                                    as at_bats,
  count(ab.id) filter (where ab.result in
    ('single','double','triple','home_run'))               as hits,
  count(ab.id) filter (where ab.result = 'single')        as singles,
  count(ab.id) filter (where ab.result = 'double')        as doubles,
  count(ab.id) filter (where ab.result = 'triple')        as triples,
  count(ab.id) filter (where ab.result = 'home_run')      as home_runs,
  coalesce(sum(ab.rbi), 0)                                as rbi,
  -- NOTE: "runs" = runs that scored ON this batter's plays (runs_scored is a
  -- per-play total), NOT runs scored BY the player — runner identity isn't
  -- tracked, so true R (like true SB) isn't computable from this data.
  coalesce(sum(ab.runs_scored), 0)                        as runs,
  count(ab.id) filter (where ab.result in
    ('walk','intentional_walk'))                          as walks,
  count(ab.id) filter (where ab.result = 'hbp')           as hbp,
  count(ab.id) filter (where ab.result in
    ('strikeout_looking','strikeout_swinging'))            as strikeouts,
  count(ab.id) filter (where ab.result in
    ('single','double','triple','home_run',
     'walk','hbp','intentional_walk'))                    as times_on_base,
  g.season                                                as season
from players p
left join at_bats ab on ab.batter_id = p.id
left join games g on g.id = ab.game_id
group by p.id, p.jersey_num, p.first_name,
         p.last_name, p.positions, p.top_velo, g.season;


-- Pitching stats per player
create view player_pitching_stats as
select
  p.id,
  p.jersey_num,
  p.first_name,
  p.last_name,
  count(pi.id)                                             as total_pitches,
  count(pi.id) filter (where pi.result = 'ball')          as balls_thrown,
  count(pi.id) filter (where pi.result like 'strike%'
                          or pi.result = 'foul')          as strikes_thrown,
  max(pi.velocity_mph)                                    as peak_velo,
  round(avg(pi.velocity_mph)::numeric, 1)                 as avg_velo,
  count(distinct pi.game_id)                              as games_pitched
from players p
join pitches pi on pi.pitcher_id = p.id
group by p.id, p.jersey_num, p.first_name, p.last_name;


-- Live game summary (what the viewer page polls)
create view live_game_summary as
select
  g.*,
  o.name  as opponent_name,
  t.name  as team_name
from games g
join teams t on t.id = g.team_id
left join opponents o on o.id = g.opponent_id
where g.status = 'live';


-- ============================================================
-- ROW LEVEL SECURITY
-- Anyone can read. Only authenticated scorers can write.
-- ============================================================
alter table teams     enable row level security;
alter table players   enable row level security;
alter table games     enable row level security;
alter table at_bats   enable row level security;
alter table pitches   enable row level security;
alter table opponents enable row level security;

-- Public read
create policy "public read teams"     on teams     for select using (true);
create policy "public read players"   on players   for select using (true);
create policy "public read games"     on games     for select using (true);
create policy "public read at_bats"   on at_bats   for select using (true);
create policy "public read pitches"   on pitches   for select using (true);
create policy "public read opponents" on opponents for select using (true);

-- Authenticated write (your scorer login only)
create policy "auth write teams"     on teams     for all using (auth.role() = 'authenticated');
create policy "auth write players"   on players   for all using (auth.role() = 'authenticated');
create policy "auth write games"     on games     for all using (auth.role() = 'authenticated');
create policy "auth write at_bats"   on at_bats   for all using (auth.role() = 'authenticated');
create policy "auth write pitches"   on pitches   for all using (auth.role() = 'authenticated');
create policy "auth write opponents" on opponents for all using (auth.role() = 'authenticated');

-- App (anon key) delete — what makes the scorer's Undo and admin.html's
-- Reset/Delete actually remove rows. Same public posture as "app can delete
-- games" (2026-07-14): the anon key is public, so anyone with it could delete
-- play data; real lockdown would require Supabase Auth.
create policy "app can delete games"   on games   for delete to anon using (true);
create policy "app can delete at_bats" on at_bats for delete to anon using (true);
create policy "app can delete pitches" on pitches for delete to anon using (true);


-- ============================================================
-- REAL-TIME  (enable live push to viewer browsers)
-- ============================================================
alter publication supabase_realtime add table pitches;
alter publication supabase_realtime add table at_bats;
alter publication supabase_realtime add table games;


-- ============================================================
-- SEED DATA  · Delmarva Aces 12U East · Spring 2026
-- Real stats from GameChanger season export
-- ============================================================

insert into teams (id, name, short_name, age_group, division, season_year)
values (
  'a0000000-0000-0000-0000-000000000001',
  'Delmarva Aces', 'Aces', '12U', 'East', 2026
);

insert into players
  (team_id, jersey_num, first_name, last_name, positions, grad_year)
values
  ('a0000000-0000-0000-0000-000000000001',  2, 'Declan',  'Soares',     ARRAY['LF'],       2032),
  ('a0000000-0000-0000-0000-000000000001',  3, 'Jackson', 'Booher',     ARRAY['RF','CF'],  2032),
  ('a0000000-0000-0000-0000-000000000001',  4, 'Raiden',  'Sheets',     ARRAY['1B','P'],   2032),
  ('a0000000-0000-0000-0000-000000000001',  5, 'Brody',   'Pegelow',    ARRAY['P','1B'],   2032),
  ('a0000000-0000-0000-0000-000000000001', 11, 'Hudson',  'Hartstein',  ARRAY['3B','P'],   2032),
  ('a0000000-0000-0000-0000-000000000001', 12, 'Ridge',   'Tervo',      ARRAY['P'],        2032),
  ('a0000000-0000-0000-0000-000000000001', 13, 'Brody',   'Snyder',     ARRAY['P','OF'],   2032),
  ('a0000000-0000-0000-0000-000000000001', 23, 'Jake',    'Coulbourne', ARRAY['SS','P'],   2032),
  ('a0000000-0000-0000-0000-000000000001', 24, 'Cooper',  'Lewis',      ARRAY['C','1B'],   2032),
  ('a0000000-0000-0000-0000-000000000001', 27, 'Wyatt',   'Wiltbank',   ARRAY['CF','P'],   2032),
  ('a0000000-0000-0000-0000-000000000001', 47, 'Mason',   'Maloney',    ARRAY['RF','P'],   2032),
  ('a0000000-0000-0000-0000-000000000001', 50, 'Hunter',  'Washbon',    ARRAY['SS','OF'],  2032),
  ('a0000000-0000-0000-0000-000000000001', 54, 'Ayden',   'Jester',     ARRAY['2B','P'],   2032);


-- ============================================================
-- NEXT STEPS
-- ============================================================
-- 1. After running this, go to:
--    Supabase → Database → Tables
--    You should see 5 tables: teams, players, games, at_bats, pitches
--    and 1 opponents table.
--
-- 2. Go to Settings → API and copy:
--    - Project URL  →  paste into the website as SUPABASE_URL
--    - anon/public key  →  paste in as SUPABASE_ANON_KEY
--
-- 3. The player_season_stats view will auto-calculate batting
--    averages, OBP, SLG, OPS etc. from raw at_bat rows as you
--    score games. No manual stat updates needed.
--
-- 4. To import historical stats from GameChanger CSVs, use the
--    CSV import tool in Supabase → Table Editor → Import data.
-- ============================================================
