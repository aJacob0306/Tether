-- Leave / delete tether: members can leave; creators can delete the whole tether.

create or replace function public.leave_tether(p_tether_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_creator boolean;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_tether_member(p_tether_id, v_user_id) then
    raise exception 'Not a member of this tether';
  end if;

  select (created_by = v_user_id) into v_is_creator
  from public.tethers
  where id = p_tether_id;

  if v_is_creator then
    raise exception 'Creators cannot leave. Delete the tether instead.';
  end if;

  delete from public.tether_members
  where tether_id = p_tether_id
    and user_id = v_user_id;
end;
$$;

grant execute on function public.leave_tether(uuid) to authenticated;

create or replace function public.delete_tether(p_tether_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.tethers
    where id = p_tether_id
      and created_by = v_user_id
  ) then
    raise exception 'Only the creator can delete this tether';
  end if;

  -- Clears profiles.active_tether_id via ON DELETE SET NULL / membership trigger.
  delete from public.tethers
  where id = p_tether_id
    and created_by = v_user_id;
end;
$$;

grant execute on function public.delete_tether(uuid) to authenticated;
