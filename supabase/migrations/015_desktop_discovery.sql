-- Desktop companion device registration and installed app discovery.

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  installation_id text not null,
  platform text not null,
  device_type text not null default 'desktop',
  display_name text not null,
  app_version text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint devices_installation_id_not_empty check (char_length(trim(installation_id)) > 0),
  constraint devices_platform_not_empty check (char_length(trim(platform)) > 0),
  constraint devices_device_type_valid check (device_type in ('desktop', 'mobile', 'extension')),
  constraint devices_display_name_not_empty check (char_length(trim(display_name)) > 0),
  unique (user_id, installation_id),
  unique (id, user_id)
);

alter table public.devices enable row level security;

create policy "Users manage own devices"
  on public.devices
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index devices_user_id_idx
  on public.devices (user_id);

create table public.detected_tools (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id uuid not null,
  tool_type public.allowed_target_type not null default 'app',
  value text not null,
  display_name text not null,
  tool_key text not null,
  bundle_identifier text,
  install_path text,
  platform text not null default 'macos',
  metadata jsonb not null default '{}'::jsonb,
  is_available boolean not null default true,
  detected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint detected_tools_device_owner_fk
    foreign key (device_id, user_id)
    references public.devices (id, user_id)
    on delete cascade,
  constraint detected_tools_value_not_empty check (char_length(trim(value)) > 0),
  constraint detected_tools_display_name_not_empty check (char_length(trim(display_name)) > 0),
  constraint detected_tools_tool_key_not_empty check (char_length(trim(tool_key)) > 0),
  constraint detected_tools_platform_not_empty check (char_length(trim(platform)) > 0),
  unique (user_id, device_id, tool_type, tool_key)
);

alter table public.detected_tools enable row level security;

create policy "Users manage own detected tools"
  on public.detected_tools
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index detected_tools_user_available_idx
  on public.detected_tools (user_id, is_available, tool_type, display_name);

create index detected_tools_device_id_idx
  on public.detected_tools (device_id);

alter table public.tether_allowed_targets
  add column if not exists detected_tool_id uuid references public.detected_tools (id) on delete set null,
  add column if not exists display_name text,
  add column if not exists bundle_identifier text,
  add column if not exists platform text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index tether_allowed_targets_detected_tool_id_idx
  on public.tether_allowed_targets (detected_tool_id);

create or replace function public.touch_desktop_discovery_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger devices_touch_updated_at
  before update on public.devices
  for each row
  execute function public.touch_desktop_discovery_updated_at();

create trigger detected_tools_touch_updated_at
  before update on public.detected_tools
  for each row
  execute function public.touch_desktop_discovery_updated_at();
