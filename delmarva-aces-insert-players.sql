-- Insert Delmarva Aces players with Spring 2026 stats
-- Run this in Supabase SQL Editor

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
  ('a0000000-0000-0000-0000-000000000001', 54, 'Ayden',   'Jester',     ARRAY['2B','P'],   2032)
on conflict do nothing;

-- Verify it worked
select jersey_num, first_name, last_name from players order by jersey_num;
