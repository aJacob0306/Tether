-- Backfill profiles for users created before the profiles trigger existed.
-- This preserves existing profile rows and only inserts missing ones.

insert into public.profiles (id, display_name, created_at)
select
  users.id,
  coalesce(
    nullif(trim(users.raw_user_meta_data->>'display_name'), ''),
    nullif(split_part(users.email, '@', 1), ''),
    'Tether User'
  ) as display_name,
  now()
from auth.users
where not exists (
  select 1
  from public.profiles
  where profiles.id = users.id
);
