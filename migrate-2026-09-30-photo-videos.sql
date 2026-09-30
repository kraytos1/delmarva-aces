-- Videos in the photo gallery: the video lives on YouTube (unlisted), the
-- gallery row stores its id. url = the YouTube thumbnail, storage_key stays
-- null (nothing in the bucket), so a video costs zero Supabase storage/egress.
-- Adding one is coach-only in the UI (photos.html, shared PIN unlock).
alter table team_photos add column if not exists youtube_id text;
