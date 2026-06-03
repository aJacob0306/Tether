-- Tethers: shared accountability groups with peer visibility into active_tabs.

create table if not exists public.active_tabs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  url text not null default '',
  title text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.active_tabs enable row level security;

create table public.tethers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.tethers enable row level security;

create table public.tether_members (
  tether_id uuid not null references public.tethers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (tether_id, user_id)
);

alter table public.tether_members enable row level security;

create or replace function public.shares_tether_with(viewer uuid, target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tether_members tm1
    join public.tether_members tm2 on tm1.tether_id = tm2.tether_id
    where tm1.user_id = viewer
      and tm2.user_id = target
  );
$$;

create or replace function public.is_tether_member(p_tether_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tether_members
    where tether_id = p_tether_id
      and user_id = p_user_id
  );
$$;

-- active_tabs policies (skip if already applied manually)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'active_tabs'
      and policyname = 'Users manage own active tab'
  ) then
    create policy "Users manage own active tab"
      on public.active_tabs
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

create policy "Tether peers can view active tabs"
  on public.active_tabs
  for select
  using (public.shares_tether_with(auth.uid(), user_id));

create policy "Tether peers can view profiles"
  on public.profiles
  for select
  using (public.shares_tether_with(auth.uid(), id));

create policy "Members can view their tethers"
  on public.tethers
  for select
  using (public.is_tether_member(id, auth.uid()));

create policy "Authenticated users can create tethers"
  on public.tethers
  for insert
  with check (auth.uid() = created_by);

create policy "Creators can view their tethers"
  on public.tethers
  for select
  using (created_by = auth.uid());

create policy "Members can view tether membership"
  on public.tether_members
  for select
  using (public.is_tether_member(tether_id, auth.uid()));

create policy "Users can join tethers"
  on public.tether_members
  for insert
  with check (auth.uid() = user_id);

create or replace function public.join_tether_by_code(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tether_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id into v_tether_id
  from public.tethers
  where invite_code = upper(trim(p_invite_code));

  if v_tether_id is null then
    raise exception 'Invalid invite code';
  end if;

  insert into public.tether_members (tether_id, user_id)
  values (v_tether_id, auth.uid())
  on conflict do nothing;

  return v_tether_id;
end;
$$;

grant execute on function public.join_tether_by_code(text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.active_tabs;
exception
  when duplicate_object then null;
end $$;
