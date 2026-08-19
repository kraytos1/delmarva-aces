-- Migration 2026-08-19: player_season_stats accounting fixes
-- Run once in the Supabase SQL editor. Idempotent (create or replace).
--
-- 1. Dropped 3rd strike (either outcome) now counts as a strikeout — it's a K
--    for the batter whether or not he reached 1st.
-- 2. New sac_flies column so OBP can use the rulebook denominator
--    (AB + BB + HBP + SF). index.html's calcOBP picks it up automatically
--    (treats a missing column as 0, so deploy order doesn't matter).
--
-- NOTE: postgres can't add a column mid-view with CREATE OR REPLACE, so this
-- drops and recreates. The view has no dependents (pages query it directly).

drop view if exists player_season_stats;

create view player_season_stats as
select
  p.id,
  p.jersey_num,
  p.first_name,
  p.last_name,
  p.positions,
  p.top_velo,
  count(distinct ab.game_id)                              as games_played,
  count(ab.id) filter (where ab.batter_id = p.id and ab.result not in
    ('walk','hbp','intentional_walk','sac_fly','sac_bunt',
     'stolen_base','wp_advance','pb_advance','balk_advance',
     'caught_stealing','pickoff_1b','pickoff_2b','pickoff_3b',
     'out_advancing'))                                    as at_bats,
  count(ab.id) filter (where ab.batter_id = p.id and ab.result in
    ('single','double','triple','home_run'))               as hits,
  count(ab.id) filter (where ab.batter_id = p.id and ab.result = 'single')   as singles,
  count(ab.id) filter (where ab.batter_id = p.id and ab.result = 'double')   as doubles,
  count(ab.id) filter (where ab.batter_id = p.id and ab.result = 'triple')   as triples,
  count(ab.id) filter (where ab.batter_id = p.id and ab.result = 'home_run') as home_runs,
  coalesce(sum(ab.rbi)         filter (where ab.batter_id = p.id), 0)        as rbi,
  -- NOTE: "runs" = runs that scored ON this batter's plays (runs_scored is a
  -- per-play total), NOT runs scored BY the player.
  coalesce(sum(ab.runs_scored) filter (where ab.batter_id = p.id), 0)        as runs,
  count(ab.id) filter (where ab.batter_id = p.id and ab.result in
    ('walk','intentional_walk'))                          as walks,
  count(ab.id) filter (where ab.batter_id = p.id and ab.result = 'hbp')      as hbp,
  -- dropped 3rd is a strikeout for the batter whether or not he reached
  count(ab.id) filter (where ab.batter_id = p.id and ab.result in
    ('strikeout_looking','strikeout_swinging',
     'dropped_third','dropped_third_k'))                   as strikeouts,
  -- sac flies belong in the OBP denominator (AB + BB + HBP + SF)
  count(ab.id) filter (where ab.batter_id = p.id and ab.result = 'sac_fly')  as sac_flies,
  count(ab.id) filter (where ab.batter_id = p.id and ab.result in
    ('single','double','triple','home_run',
     'walk','hbp','intentional_walk'))                    as times_on_base,
  g.season                                                as season,
  count(ab.id) filter (where ab.runner_id = p.id and ab.result = 'stolen_base')     as stolen_bases,
  count(ab.id) filter (where ab.runner_id = p.id and ab.result = 'caught_stealing') as caught_stealing
from players p
left join at_bats ab on (ab.batter_id = p.id or ab.runner_id = p.id)
left join games g on g.id = ab.game_id
group by p.id, p.jersey_num, p.first_name,
         p.last_name, p.positions, p.top_velo, g.season;
