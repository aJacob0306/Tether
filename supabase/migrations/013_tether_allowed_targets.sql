-- Creator-defined allowlist of apps and domains that count as work for a tether.

create type public.allowed_target_type as enum ('app', 'domain');

create table public.tether_allowed_targets (
  id uuid primary key default gen_random_uuid(),
  tether_id uuid not null references public.tethers (id) on delete cascade,
  target_type public.allowed_target_type not null,
  value text not null,
  created_at timestamptz not null default now(),
  constraint tether_allowed_targets_value_not_empty check (char_length(trim(value)) > 0),
  unique (tether_id, target_type, value)
);

alter table public.tether_allowed_targets enable row level security;

create or replace function public.is_tether_creator(p_tether_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tethers
    where id = p_tether_id
      and created_by = p_user_id
  );
$$;

create policy "Members can view tether allowlist"
  on public.tether_allowed_targets
  for select
  using (public.is_tether_member(tether_id, auth.uid()));

create policy "Creators can add tether allowlist entries"
  on public.tether_allowed_targets
  for insert
  with check (public.is_tether_creator(tether_id, auth.uid()));

create policy "Creators can remove tether allowlist entries"
  on public.tether_allowed_targets
  for delete
  using (public.is_tether_creator(tether_id, auth.uid()));

create index tether_allowed_targets_tether_id_idx
  on public.tether_allowed_targets (tether_id);

create or replace function public.get_my_allowed_targets()
returns table (
  target_type public.allowed_target_type,
  value text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return query
    select distinct tat.target_type, tat.value
    from public.tether_allowed_targets tat
    join public.tether_members tm
      on tm.tether_id = tat.tether_id
     and tm.user_id = auth.uid()
    order by tat.target_type, tat.value;
end;
$$;

grant execute on function public.get_my_allowed_targets() to authenticated;
