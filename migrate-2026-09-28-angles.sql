-- Multi-angle replay: extra cameras per game (unlisted YouTube uploads of the
-- cart cameras' internal recordings). delta_sec = broadcast seconds minus this
-- angle's seconds at the same moment, so angle_time = yt_offset_sec - delta_sec.
-- Coach page: /angles.html (PIN). Viewers: highlights.html, player.html.
create table if not exists game_angles (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references games(id) on delete cascade,
  label       text not null,            -- 'HP', 'CF', '1B', '3B', ...
  youtube_id  text not null,            -- 11-char video id (unlisted upload)
  delta_sec   numeric not null default 0,
  sort_order  int  not null default 0,
  created_at  timestamptz default now()
);
create index if not exists game_angles_game_idx on game_angles(game_id);
alter table game_angles enable row level security;
-- same trust model as sponsors: PIN-gated coach page over the anon key
create policy "angles public read"  on game_angles for select to anon using (true);
create policy "angles anon insert"  on game_angles for insert to anon with check (true);
create policy "angles anon update"  on game_angles for update to anon using (true) with check (true);
create policy "angles anon delete"  on game_angles for delete to anon using (true);
