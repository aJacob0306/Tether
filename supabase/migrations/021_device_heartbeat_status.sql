-- Device heartbeat status for mobile companion connection checks.
-- This does not change tracking semantics; it only lets mobile distinguish a
-- recently connected desktop companion from stale detected app inventory.

alter table public.devices
  add column if not exists revoked_at timestamptz;

create index if not exists devices_recent_desktop_heartbeat_idx
  on public.devices (user_id, device_type, last_seen_at desc)
  where revoked_at is null
    and device_type = 'desktop';

create or replace function public.get_my_device_status(
  p_recent_after timestamptz default now() - interval '5 minutes'
)
returns table (
  device_id uuid,
  device_type text,
  platform text,
  display_name text,
  app_version text,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  is_recent boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    d.id as device_id,
    d.device_type,
    d.platform,
    d.display_name,
    d.app_version,
    d.last_seen_at,
    d.revoked_at,
    d.revoked_at is null and d.last_seen_at >= p_recent_after as is_recent
  from public.devices d
  where d.user_id = auth.uid()
    and d.device_type in ('desktop', 'extension')
  order by d.device_type, d.last_seen_at desc;
$$;

grant execute on function public.get_my_device_status(timestamptz) to authenticated;
