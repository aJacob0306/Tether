-- App-aware work sessions for desktop companion foreground app tracking.

alter table public.work_sessions
  add column if not exists target_type public.allowed_target_type not null default 'domain',
  add column if not exists target_value text,
  add column if not exists target_display_name text,
  add column if not exists bundle_identifier text,
  add column if not exists platform text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.work_sessions
set
  target_type = 'domain',
  target_value = coalesce(nullif(target_value, ''), domain),
  target_display_name = coalesce(nullif(target_display_name, ''), domain)
where target_type = 'domain';

create index if not exists work_sessions_user_target_idx
  on public.work_sessions (user_id, target_type, target_value);

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
  session_title text,
  session_target_type public.allowed_target_type,
  session_target_value text,
  session_target_display_name text,
  session_bundle_identifier text,
  session_platform text
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
      ws.title as session_title,
      ws.target_type as session_target_type,
      coalesce(ws.target_value, ws.domain) as session_target_value,
      coalesce(ws.target_display_name, ws.target_value, ws.domain) as session_target_display_name,
      ws.bundle_identifier as session_bundle_identifier,
      ws.platform as session_platform
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
