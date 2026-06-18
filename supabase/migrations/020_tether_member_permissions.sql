-- Delegated allowlist management: creators can grant can_manage_allowlist to members.

alter table public.tether_members
  add column if not exists can_manage_allowlist boolean not null default false;

-- Creators always retain allowlist access via is_tether_creator; flag is for delegates.
update public.tether_members tm
set can_manage_allowlist = true
from public.tethers t
where t.id = tm.tether_id
  and t.created_by = tm.user_id;

create or replace function public.can_manage_tether_allowlist(p_tether_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_tether_creator(p_tether_id, p_user_id)
      or exists (
        select 1
        from public.tether_members tm
        where tm.tether_id = p_tether_id
          and tm.user_id = p_user_id
          and tm.can_manage_allowlist = true
      );
$$;

drop policy if exists "Creators can add tether allowlist entries" on public.tether_allowed_targets;
drop policy if exists "Creators can remove tether allowlist entries" on public.tether_allowed_targets;

create policy "Allowlist managers can add tether allowlist entries"
  on public.tether_allowed_targets
  for insert
  with check (public.can_manage_tether_allowlist(tether_id, auth.uid()));

create policy "Allowlist managers can remove tether allowlist entries"
  on public.tether_allowed_targets
  for delete
  using (public.can_manage_tether_allowlist(tether_id, auth.uid()));

create or replace function public.get_tether_members(p_tether_id uuid)
returns table (
  user_id uuid,
  display_name text,
  joined_at timestamptz,
  can_manage_allowlist boolean,
  is_creator boolean
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

  if not public.is_tether_member(p_tether_id, auth.uid()) then
    raise exception 'Not a member of this tether';
  end if;

  return query
    select
      tm.user_id,
      coalesce(p.display_name, 'Tether User') as display_name,
      tm.joined_at,
      tm.can_manage_allowlist,
      (t.created_by = tm.user_id) as is_creator
    from public.tether_members tm
    join public.tethers t on t.id = tm.tether_id
    left join public.profiles p on p.id = tm.user_id
    where tm.tether_id = p_tether_id
    order by (t.created_by = tm.user_id) desc, tm.joined_at;
end;
$$;

grant execute on function public.get_tether_members(uuid) to authenticated;

create or replace function public.set_member_allowlist_permission(
  p_tether_id uuid,
  p_user_id uuid,
  p_can_manage boolean
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

  if not public.is_tether_creator(p_tether_id, auth.uid()) then
    raise exception 'Only the tether creator can manage permissions';
  end if;

  if not public.is_tether_member(p_tether_id, p_user_id) then
    raise exception 'User is not a member of this tether';
  end if;

  if exists (
    select 1
    from public.tethers
    where id = p_tether_id
      and created_by = p_user_id
  ) then
    raise exception 'Cannot change permissions for the tether creator';
  end if;

  update public.tether_members
  set can_manage_allowlist = p_can_manage
  where tether_id = p_tether_id
    and user_id = p_user_id;
end;
$$;

grant execute on function public.set_member_allowlist_permission(uuid, uuid, boolean) to authenticated;
