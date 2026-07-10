-- Active tether attribution: store preference, tag sessions, resolve overlaps.

alter table public.profiles
  add column if not exists active_tether_id uuid references public.tethers (id) on delete set null;

alter table public.work_sessions
  add column if not exists tether_id uuid references public.tethers (id) on delete set null;

create index if not exists work_sessions_tether_started_idx
  on public.work_sessions (tether_id, started_at desc);

create index if not exists profiles_active_tether_id_idx
  on public.profiles (active_tether_id);

-- Keep active_tether_id valid: must be a tether the user belongs to.
create or replace function public.set_my_active_tether(p_tether_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_tether_id is null then
    update public.profiles
    set active_tether_id = null
    where id = auth.uid();
    return null;
  end if;

  if not public.is_tether_member(p_tether_id, auth.uid()) then
    raise exception 'Not a member of this tether';
  end if;

  update public.profiles
  set active_tether_id = p_tether_id
  where id = auth.uid();

  return p_tether_id;
end;
$$;

grant execute on function public.set_my_active_tether(uuid) to authenticated;

-- If the user has exactly one tether, make it active. If active is invalid, clear or fix.
create or replace function public.ensure_my_active_tether()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count int;
  v_only_tether uuid;
  v_active uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select
    count(*),
    (array_agg(tether_id order by joined_at asc, tether_id asc))[1]
  into v_count, v_only_tether
  from public.tether_members
  where user_id = v_user_id;

  select active_tether_id into v_active
  from public.profiles
  where id = v_user_id;

  if v_count = 0 then
    update public.profiles
    set active_tether_id = null
    where id = v_user_id;
    return null;
  end if;

  if v_count = 1 then
    update public.profiles
    set active_tether_id = v_only_tether
    where id = v_user_id;
    return v_only_tether;
  end if;

  if v_active is null or not public.is_tether_member(v_active, v_user_id) then
    update public.profiles
    set active_tether_id = null
    where id = v_user_id;
    return null;
  end if;

  return v_active;
end;
$$;

grant execute on function public.ensure_my_active_tether() to authenticated;

create or replace function public.tether_members_ensure_active_tether()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_count int;
  v_only_tether uuid;
  v_active uuid;
begin
  v_user_id := coalesce(new.user_id, old.user_id);

  select
    count(*),
    (array_agg(tether_id order by joined_at asc, tether_id asc))[1]
  into v_count, v_only_tether
  from public.tether_members
  where user_id = v_user_id;

  select active_tether_id into v_active
  from public.profiles
  where id = v_user_id;

  if v_count = 0 then
    update public.profiles set active_tether_id = null where id = v_user_id;
  elsif v_count = 1 then
    update public.profiles set active_tether_id = v_only_tether where id = v_user_id;
  elsif v_active is not null and not exists (
    select 1 from public.tether_members
    where user_id = v_user_id and tether_id = v_active
  ) then
    update public.profiles set active_tether_id = null where id = v_user_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists tether_members_ensure_active_tether on public.tether_members;
create trigger tether_members_ensure_active_tether
  after insert or delete on public.tether_members
  for each row
  execute function public.tether_members_ensure_active_tether();

-- Backfill: users with exactly one tether get it as active.
update public.profiles p
set active_tether_id = only_tether.tether_id
from (
  select
    user_id,
    (array_agg(tether_id order by joined_at asc, tether_id asc))[1] as tether_id
  from public.tether_members
  group by user_id
  having count(*) = 1
) only_tether
where p.id = only_tether.user_id
  and (p.active_tether_id is distinct from only_tether.tether_id);

-- Allowlist for trackers: include tether_id so clients can resolve attribution.
drop function if exists public.get_my_allowed_targets();

create or replace function public.get_my_allowed_targets()
returns table (
  tether_id uuid,
  target_type public.allowed_target_type,
  value text,
  display_name text,
  bundle_identifier text
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
    select
      tat.tether_id,
      tat.target_type,
      tat.value,
      tat.display_name,
      tat.bundle_identifier
    from public.tether_allowed_targets tat
    join public.tether_members tm
      on tm.tether_id = tat.tether_id
     and tm.user_id = auth.uid()
    order by tat.target_type, tat.value, tat.tether_id;
end;
$$;

grant execute on function public.get_my_allowed_targets() to authenticated;

-- Find other tethers where this user already has the same allowlist target.
create or replace function public.find_my_allowlist_conflicts(
  p_tether_id uuid,
  p_target_type public.allowed_target_type,
  p_value text,
  p_bundle_identifier text default null
)
returns table (
  tether_id uuid,
  tether_name text,
  value text,
  display_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_value text := lower(trim(coalesce(p_value, '')));
  v_bundle text := nullif(trim(coalesce(p_bundle_identifier, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_tether_member(p_tether_id, auth.uid()) then
    raise exception 'Not a member of this tether';
  end if;

  if v_value = '' then
    return;
  end if;

  return query
    select
      t.id,
      t.name,
      tat.value,
      tat.display_name
    from public.tether_allowed_targets tat
    join public.tethers t on t.id = tat.tether_id
    join public.tether_members tm
      on tm.tether_id = tat.tether_id
     and tm.user_id = auth.uid()
    where tat.tether_id <> p_tether_id
      and tat.target_type = p_target_type
      and (
        lower(tat.value) = v_value
        or (
          p_target_type = 'app'
          and v_bundle is not null
          and tat.bundle_identifier is not null
          and tat.bundle_identifier = v_bundle
        )
        or (
          p_target_type = 'domain'
          and (
            lower(tat.value) = v_value
            or v_value like '%.' || lower(tat.value)
            or lower(tat.value) like '%.' || v_value
          )
        )
      )
    order by t.name;
end;
$$;

grant execute on function public.find_my_allowlist_conflicts(
  uuid,
  public.allowed_target_type,
  text,
  text
) to authenticated;

-- Board / log RPCs: prefer tether_id; fall back to allowlist match for legacy null rows.
create or replace function public.work_session_belongs_to_tether(
  p_session public.work_sessions,
  p_tether_id uuid
)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    case
      when p_session.tether_id is not null then p_session.tether_id = p_tether_id
      else exists (
        select 1
        from public.tether_allowed_targets tat
        where tat.tether_id = p_tether_id
          and (
            (
              coalesce(p_session.target_type, 'domain') = 'domain'
              and tat.target_type = 'domain'
              and (
                lower(p_session.domain) = lower(tat.value)
                or lower(p_session.domain) like '%.' || lower(tat.value)
              )
            )
            or (
              p_session.target_type = 'app'
              and tat.target_type = 'app'
              and (
                lower(coalesce(p_session.target_value, '')) = lower(tat.value)
                or (
                  p_session.bundle_identifier is not null
                  and tat.bundle_identifier is not null
                  and p_session.bundle_identifier = tat.bundle_identifier
                )
              )
            )
          )
      )
    end;
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
    and public.work_session_effective_end(ws.updated_at, ws.ended_at) > p_day_start
    and public.work_session_belongs_to_tether(ws, p_tether_id);

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
        and public.work_session_belongs_to_tether(ws, p_tether_id)
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

-- Board: only show open sessions attributed to this tether (or legacy allowlist match).
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
    with board_members as (
      select
        tm.user_id,
        coalesce(p.display_name, 'Tether User') as display_name,
        tm.joined_at,
        at.url as tab_url,
        at.title as tab_title,
        at.updated_at as tab_updated_at,
        ws.id as session_id,
        ws.started_at,
        ws.updated_at as session_updated_at,
        ws.domain,
        ws.url as session_url,
        ws.title as session_title,
        ws.target_type,
        ws.target_value,
        ws.target_display_name,
        ws.bundle_identifier,
        ws.platform,
        case
          when ws.id is not null and public.work_session_belongs_to_tether(ws, p_tether_id)
          then true
          else false
        end as session_for_tether
      from public.tether_members tm
      left join public.profiles p on p.id = tm.user_id
      left join public.active_tabs at on at.user_id = tm.user_id
      left join public.work_sessions ws
        on ws.user_id = tm.user_id
       and ws.ended_at is null
      where tm.tether_id = p_tether_id
    )
    select
      bm.user_id,
      bm.display_name,
      case when bm.session_for_tether then bm.tab_url else null end as url,
      case when bm.session_for_tether then bm.tab_title else null end as title,
      case when bm.session_for_tether then bm.tab_updated_at else null end as updated_at,
      case when bm.session_for_tether then bm.started_at else null end as session_started_at,
      case when bm.session_for_tether then bm.session_updated_at else null end as session_updated_at,
      case when bm.session_for_tether then bm.domain else null end as session_domain,
      case when bm.session_for_tether then bm.session_url else null end as session_url,
      case when bm.session_for_tether then bm.session_title else null end as session_title,
      case when bm.session_for_tether then bm.target_type else null end as session_target_type,
      case when bm.session_for_tether then bm.target_value else null end as session_target_value,
      case when bm.session_for_tether then bm.target_display_name else null end as session_target_display_name,
      case when bm.session_for_tether then bm.bundle_identifier else null end as session_bundle_identifier,
      case when bm.session_for_tether then bm.platform else null end as session_platform
    from board_members bm
    order by bm.display_name nulls last, bm.joined_at;
end;
$$;

grant execute on function public.get_tether_board(uuid) to authenticated;

-- Personal log tether totals: prefer tether_id, no double-count across tethers for tagged sessions.
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
    attributed as (
      select
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
      join public.work_sessions ws on ws.user_id = v_user_id
      where public.work_session_belongs_to_tether(ws, mt.tether_id)
    )
    select
      mt.tether_id,
      mt.tether_name,
      coalesce(sum(a.session_ms), 0)::bigint as work_ms
    from my_tethers mt
    left join attributed a on a.tether_id = mt.tether_id
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
