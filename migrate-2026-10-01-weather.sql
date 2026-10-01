-- Between-innings "Conditions" card on the scorebug (controls.html toggle).
-- break_weather: off by default. weather_place: optional override / fallback
-- ("Salisbury, MD") when the game row has no location or it will not geocode.
alter table app_settings add column if not exists break_weather boolean default false;
alter table app_settings add column if not exists weather_place text;
