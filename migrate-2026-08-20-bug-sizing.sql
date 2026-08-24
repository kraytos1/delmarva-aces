-- Migration 2026-08-20: scorebug + sponsor plate sizing/placement settings
-- Run once in the Supabase SQL editor. Idempotent.
--
-- New Controls-page settings (scorebug.html reads them live via its poll):
--   bug_scale     numeric  scorebug size multiplier, 0.5–2 (null/1 = default)
--   sponsor_pos   text     'dock' (beside the bug) or 'bl'|'br'|'tl'|'tr'
--   sponsor_scale numeric  floated-plate size multiplier, 0.5–2
--
-- URL switches (?scale= ?sponsorpos= ?sponsorscale=) remain hard overrides.

alter table app_settings add column if not exists bug_scale     numeric;
alter table app_settings add column if not exists sponsor_pos   text;
alter table app_settings add column if not exists sponsor_scale numeric;
