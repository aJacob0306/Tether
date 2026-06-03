-- Load a tether board through a SECURITY DEFINER function so member names,
-- active tabs, and membership can be joined consistently under RLS.

create or replace function public.get_tether_board(p_tether_id uuid)
returns table (
  user_id uuid,
  display_name text,
  url text,
  title text,
  updated_at timestamptz
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
      at.url,
      at.title,
      at.updated_at
    from public.tether_members tm
    left join public.profiles p on p.id = tm.user_id
    left join public.active_tabs at on at.user_id = tm.user_id
    where tm.tether_id = p_tether_id
    order by p.display_name nulls last, tm.joined_at;
end;
$$;

grant execute on function public.get_tether_board(uuid) to authenticated;
