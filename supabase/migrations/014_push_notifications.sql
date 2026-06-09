-- Push tokens for Expo notifications + helper RPCs for work-start alerts.

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expo_push_token text not null,
  platform text not null default 'ios',
  updated_at timestamptz not null default now(),
  constraint push_tokens_token_not_empty check (char_length(trim(expo_push_token)) > 0),
  unique (user_id, expo_push_token)
);

alter table public.push_tokens enable row level security;

create policy "Users manage own push tokens"
  on public.push_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index push_tokens_user_id_idx on public.push_tokens (user_id);

create or replace function public.register_push_token(
  p_token text,
  p_platform text default 'ios'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if char_length(trim(p_token)) = 0 then
    raise exception 'Push token is required';
  end if;

  insert into public.push_tokens (user_id, expo_push_token, platform)
  values (
    auth.uid(),
    trim(p_token),
    coalesce(nullif(trim(p_platform), ''), 'ios')
  )
  on conflict (user_id, expo_push_token)
  do update set
    platform = excluded.platform,
    updated_at = now();
end;
$$;

grant execute on function public.register_push_token(text, text) to authenticated;

create or replace function public.get_peer_push_tokens(p_user_id uuid)
returns table (expo_push_token text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct pt.expo_push_token
  from public.tether_members tm_self
  join public.tether_members tm_peer
    on tm_peer.tether_id = tm_self.tether_id
   and tm_peer.user_id <> tm_self.user_id
  join public.push_tokens pt
    on pt.user_id = tm_peer.user_id
  where tm_self.user_id = p_user_id;
$$;

grant execute on function public.get_peer_push_tokens(uuid) to service_role;
