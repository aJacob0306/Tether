-- Sum each tether member's work-session time within a caller-provided day window.

create or replace function public.get_tether_daily_work_total(
  p_tether_id uuid,
  p_day_start timestamptz,
  p_day_end timestamptz
)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total_ms bigint;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_day_end <= p_day_start then
    raise exception 'Invalid day window';
  end if;

  if not public.is_tether_member(p_tether_id, auth.uid()) then
    raise exception 'Not a member of this tether';
  end if;

  select coalesce(
    sum(
      greatest(
        0,
        extract(
          epoch from (
            least(coalesce(ws.ended_at, least(ws.updated_at, now())), p_day_end)
            - greatest(ws.started_at, p_day_start)
          )
        ) * 1000
      )
    )::bigint,
    0
  )
  into v_total_ms
  from public.work_sessions ws
  join public.tether_members tm
    on tm.user_id = ws.user_id
   and tm.tether_id = p_tether_id
  where ws.started_at < p_day_end
    and coalesce(ws.ended_at, least(ws.updated_at, now())) > p_day_start;

  return v_total_ms;
end;
$$;

grant execute on function public.get_tether_daily_work_total(uuid, timestamptz, timestamptz) to authenticated;
