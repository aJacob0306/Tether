-- Cap reported work duration at last activity when sessions were closed with an inflated ended_at.

create or replace function public.work_session_effective_end(
  p_updated_at timestamptz,
  p_ended_at timestamptz,
  p_stale_grace interval default interval '15 minutes'
)
returns timestamptz
language sql
stable
as $$
  select least(
    coalesce(
      case
        when p_ended_at is not null and p_ended_at > p_updated_at + p_stale_grace
        then p_updated_at
        else p_ended_at
      end,
      least(p_updated_at, now())
    ),
    now()
  );
$$;

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
            least(public.work_session_effective_end(ws.updated_at, ws.ended_at), p_day_end)
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
    and public.work_session_effective_end(ws.updated_at, ws.ended_at) > p_day_start;

  return v_total_ms;
end;
$$;

grant execute on function public.get_tether_daily_work_total(uuid, timestamptz, timestamptz) to authenticated;

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
        coalesce(ws.target_type, 'domain'::public.allowed_target_type) as target_type,
        coalesce(ws.target_display_name, ws.target_value, ws.domain) as target_label,
        greatest(
          0,
          extract(
            epoch from (
              least(public.work_session_effective_end(ws.updated_at, ws.ended_at), p_day_end)
              - greatest(ws.started_at, p_day_start)
            )
          ) * 1000
        )::bigint as work_ms
      from public.work_sessions ws
      join members m on m.user_id = ws.user_id
      where ws.started_at < p_day_end
        and public.work_session_effective_end(ws.updated_at, ws.ended_at) > p_day_start
    ),
    target_totals as (
      select
        so.user_id,
        so.target_type,
        so.target_label,
        sum(so.work_ms)::bigint as work_ms
      from session_overlaps so
      where so.work_ms > 0
      group by so.user_id, so.target_type, so.target_label
    ),
    member_totals as (
      select
        tt.user_id,
        sum(tt.work_ms)::bigint as total_work_ms
      from target_totals tt
      group by tt.user_id
    ),
    ranked_targets as (
      select
        tt.user_id,
        tt.target_type,
        tt.target_label,
        tt.work_ms,
        row_number() over (
          partition by tt.user_id
          order by tt.work_ms desc, tt.target_label asc
        ) as target_rank
      from target_totals tt
    ),
    top_target_totals as (
      select
        rt.user_id,
        jsonb_agg(
          jsonb_build_object(
            'domain', rt.target_label,
            'target_type', rt.target_type,
            'work_ms', rt.work_ms
          )
          order by rt.work_ms desc, rt.target_label asc
        ) as top_domains
      from ranked_targets rt
      where rt.target_rank <= 3
      group by rt.user_id
    )
    select
      m.user_id,
      m.display_name,
      coalesce(mt.total_work_ms, 0)::bigint as total_work_ms,
      coalesce(ttt.top_domains, '[]'::jsonb) as top_domains
    from members m
    left join member_totals mt on mt.user_id = m.user_id
    left join top_target_totals ttt on ttt.user_id = m.user_id
    order by m.display_name nulls last, m.joined_at;
end;
$$;

grant execute on function public.get_tether_daily_member_logs(uuid, timestamptz, timestamptz) to authenticated;
