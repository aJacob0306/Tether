-- Personal log: lifetime / daily / weekly stats, top tools, streak, and per-tether totals for the signed-in user.

create or replace function public.get_my_personal_log(
  p_day_start timestamptz,
  p_day_end timestamptz,
  p_week_start timestamptz,
  p_week_end timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_lifetime_ms bigint := 0;
  v_today_ms bigint := 0;
  v_streak_days int := 0;
  v_top_targets jsonb := '[]'::jsonb;
  v_week_days jsonb := '[]'::jsonb;
  v_tether_totals jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_day_end <= p_day_start then
    raise exception 'Invalid day window';
  end if;

  if p_week_end <= p_week_start then
    raise exception 'Invalid week window';
  end if;

  select coalesce(
    sum(
      greatest(
        0,
        extract(
          epoch from (
            public.work_session_effective_end(ws.updated_at, ws.ended_at)
            - ws.started_at
          )
        ) * 1000
      )
    )::bigint,
    0
  )
  into v_lifetime_ms
  from public.work_sessions ws
  where ws.user_id = v_user_id;

  select coalesce(
    sum(
      greatest(
        0,
        extract(
          epoch from (
            least(public.work_session_effective_end(ws.updated_at, ws.ended_at), p_day_end)
            - greatest(ws.started_at, p_day_start)
          )
        ) * 1000
      )
    )::bigint,
    0
  )
  into v_today_ms
  from public.work_sessions ws
  where ws.user_id = v_user_id
    and ws.started_at < p_day_end
    and public.work_session_effective_end(ws.updated_at, ws.ended_at) > p_day_start;

  with day_series as (
    select
      generate_series(
        p_day_start - interval '364 days',
        p_day_start,
        interval '1 day'
      ) as day_start
  ),
  day_windows as (
    select
      ds.day_start,
      ds.day_start + interval '1 day' as day_end
    from day_series ds
  ),
  day_totals as (
    select
      dw.day_start,
      coalesce(
        sum(
          greatest(
            0,
            extract(
              epoch from (
                least(public.work_session_effective_end(ws.updated_at, ws.ended_at), dw.day_end)
                - greatest(ws.started_at, dw.day_start)
              )
            ) * 1000
          )
        )::bigint,
        0
      ) as work_ms
    from day_windows dw
    left join public.work_sessions ws
      on ws.user_id = v_user_id
     and ws.started_at < dw.day_end
     and public.work_session_effective_end(ws.updated_at, ws.ended_at) > dw.day_start
    group by dw.day_start
  ),
  ordered_days as (
    select
      day_start,
      work_ms,
      row_number() over (order by day_start desc) as day_rank
    from day_totals
  ),
  -- If today has no work yet, start the streak from yesterday so morning opens don't reset it.
  streak_cut as (
    select min(day_rank) as cut_rank
    from ordered_days
    where work_ms <= 0
      and day_rank > case
        when (select work_ms from ordered_days where day_rank = 1) <= 0 then 1
        else 0
      end
  )
  select coalesce(
    (
      select count(*)::int
      from ordered_days od
      where od.work_ms > 0
        and od.day_rank < coalesce((select cut_rank from streak_cut), 366)
    ),
    0
  )
  into v_streak_days;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'domain', ranked.target_label,
        'target_type', ranked.target_type,
        'work_ms', ranked.work_ms
      )
      order by ranked.work_ms desc, ranked.target_label asc
    ),
    '[]'::jsonb
  )
  into v_top_targets
  from (
    select
      coalesce(ws.target_type, 'domain'::public.allowed_target_type) as target_type,
      coalesce(ws.target_display_name, ws.target_value, ws.domain) as target_label,
      sum(
        greatest(
          0,
          extract(
            epoch from (
              public.work_session_effective_end(ws.updated_at, ws.ended_at)
              - ws.started_at
            )
          ) * 1000
        )
      )::bigint as work_ms
    from public.work_sessions ws
    where ws.user_id = v_user_id
    group by 1, 2
    order by work_ms desc, target_label asc
    limit 8
  ) ranked;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'day_start', to_char(day_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'work_ms', work_ms
      )
      order by day_start asc
    ),
    '[]'::jsonb
  )
  into v_week_days
  from (
    select
      gs.day_start,
      coalesce(
        sum(
          greatest(
            0,
            extract(
              epoch from (
                least(
                  public.work_session_effective_end(ws.updated_at, ws.ended_at),
                  gs.day_start + interval '1 day'
                )
                - greatest(ws.started_at, gs.day_start)
              )
            ) * 1000
          )
        )::bigint,
        0
      ) as work_ms
    from generate_series(p_week_start, p_week_end - interval '1 day', interval '1 day') as gs(day_start)
    left join public.work_sessions ws
      on ws.user_id = v_user_id
     and ws.started_at < gs.day_start + interval '1 day'
     and public.work_session_effective_end(ws.updated_at, ws.ended_at) > gs.day_start
    group by gs.day_start
  ) week_totals;

  -- Note: sessions matching allowlists in multiple tethers are counted in each tether.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tether_id', totals.tether_id,
        'tether_name', totals.tether_name,
        'work_ms', totals.work_ms
      )
      order by totals.work_ms desc, totals.tether_name asc
    ),
    '[]'::jsonb
  )
  into v_tether_totals
  from (
    with my_tethers as (
      select t.id as tether_id, t.name as tether_name
      from public.tether_members tm
      join public.tethers t on t.id = tm.tether_id
      where tm.user_id = v_user_id
    ),
    matched_sessions as (
      select distinct
        mt.tether_id,
        ws.id as session_id,
        greatest(
          0,
          extract(
            epoch from (
              public.work_session_effective_end(ws.updated_at, ws.ended_at)
              - ws.started_at
            )
          ) * 1000
        )::bigint as session_ms
      from my_tethers mt
      join public.tether_allowed_targets tat on tat.tether_id = mt.tether_id
      join public.work_sessions ws on ws.user_id = v_user_id
      where (
        (
          coalesce(ws.target_type, 'domain') = 'domain'
          and tat.target_type = 'domain'
          and (
            lower(ws.domain) = lower(tat.value)
            or lower(ws.domain) like '%.' || lower(tat.value)
          )
        )
        or (
          ws.target_type = 'app'
          and tat.target_type = 'app'
          and (
            lower(coalesce(ws.target_value, '')) = lower(tat.value)
            or (
              ws.bundle_identifier is not null
              and tat.bundle_identifier is not null
              and ws.bundle_identifier = tat.bundle_identifier
            )
          )
        )
      )
    )
    select
      mt.tether_id,
      mt.tether_name,
      coalesce(sum(ms.session_ms), 0)::bigint as work_ms
    from my_tethers mt
    left join matched_sessions ms on ms.tether_id = mt.tether_id
    group by mt.tether_id, mt.tether_name
  ) totals;

  return jsonb_build_object(
    'lifetime_work_ms', v_lifetime_ms,
    'today_work_ms', v_today_ms,
    'streak_days', v_streak_days,
    'top_targets', v_top_targets,
    'week_days', v_week_days,
    'tether_totals', v_tether_totals
  );
end;
$$;

grant execute on function public.get_my_personal_log(
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz
) to authenticated;
