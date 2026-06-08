-- Per-member daily work totals and top domains for the Tether detailed log.

create or replace function public.get_tether_daily_member_logs(
  p_tether_id uuid,
  p_day_start timestamptz,
  p_day_end timestamptz
)
returns table (
  user_id uuid,
  display_name text,
  total_work_ms bigint,
  top_domains jsonb
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

  if p_day_end <= p_day_start then
    raise exception 'Invalid day window';
  end if;

  if not public.is_tether_member(p_tether_id, auth.uid()) then
    raise exception 'Not a member of this tether';
  end if;

  return query
    with members as (
      select
        tm.user_id,
        coalesce(p.display_name, 'Tether User') as display_name,
        tm.joined_at
      from public.tether_members tm
      left join public.profiles p on p.id = tm.user_id
      where tm.tether_id = p_tether_id
    ),
    session_overlaps as (
      select
        ws.user_id,
        ws.domain,
        greatest(
          0,
          extract(
            epoch from (
              least(coalesce(ws.ended_at, least(ws.updated_at, now())), p_day_end)
              - greatest(ws.started_at, p_day_start)
            )
          ) * 1000
        )::bigint as work_ms
      from public.work_sessions ws
      join members m on m.user_id = ws.user_id
      where ws.started_at < p_day_end
        and coalesce(ws.ended_at, least(ws.updated_at, now())) > p_day_start
    ),
    domain_totals as (
      select
        so.user_id,
        so.domain,
        sum(so.work_ms)::bigint as work_ms
      from session_overlaps so
      where so.work_ms > 0
      group by so.user_id, so.domain
    ),
    member_totals as (
      select
        dt.user_id,
        sum(dt.work_ms)::bigint as total_work_ms
      from domain_totals dt
      group by dt.user_id
    ),
    ranked_domains as (
      select
        dt.user_id,
        dt.domain,
        dt.work_ms,
        row_number() over (
          partition by dt.user_id
          order by dt.work_ms desc, dt.domain asc
        ) as domain_rank
      from domain_totals dt
    ),
    top_domain_totals as (
      select
        rd.user_id,
        jsonb_agg(
          jsonb_build_object(
            'domain', rd.domain,
            'work_ms', rd.work_ms
          )
          order by rd.work_ms desc, rd.domain asc
        ) as top_domains
      from ranked_domains rd
      where rd.domain_rank <= 3
      group by rd.user_id
    )
    select
      m.user_id,
      m.display_name,
      coalesce(mt.total_work_ms, 0)::bigint as total_work_ms,
      coalesce(tdt.top_domains, '[]'::jsonb) as top_domains
    from members m
    left join member_totals mt on mt.user_id = m.user_id
    left join top_domain_totals tdt on tdt.user_id = m.user_id
    order by m.display_name nulls last, m.joined_at;
end;
$$;

grant execute on function public.get_tether_daily_member_logs(uuid, timestamptz, timestamptz) to authenticated;
