-- Extend tether board with open work session fields + Realtime on work_sessions.

do $$
begin
  alter publication supabase_realtime add table public.work_sessions;
exception
  when duplicate_object then null;
end $$;

drop function if exists public.get_tether_board(uuid);

create or replace function public.get_tether_board(p_tether_id uuid)
returns table (
  user_id uuid,
  display_name text,
  url text,
  title text,
  updated_at timestamptz,
  session_started_at timestamptz,
  session_updated_at timestamptz,
  session_domain text,
  session_url text,
  session_title text
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
      at.updated_at,
      ws.started_at as session_started_at,
      ws.updated_at as session_updated_at,
      ws.domain as session_domain,
      ws.url as session_url,
      ws.title as session_title
    from public.tether_members tm
    left join public.profiles p on p.id = tm.user_id
    left join public.active_tabs at on at.user_id = tm.user_id
    left join public.work_sessions ws
      on ws.user_id = tm.user_id and ws.ended_at is null
    where tm.tether_id = p_tether_id
    order by p.display_name nulls last, tm.joined_at;
end;
$$;

grant execute on function public.get_tether_board(uuid) to authenticated;
