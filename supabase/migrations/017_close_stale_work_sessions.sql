-- Close orphaned open work sessions whose activity has gone stale.

create or replace function public.close_stale_open_work_sessions(p_stale_minutes int default 15)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  closed_count int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_stale_minutes < 1 then
    raise exception 'p_stale_minutes must be at least 1';
  end if;

  update public.work_sessions
  set ended_at = updated_at
  where user_id = auth.uid()
    and ended_at is null
    and updated_at < now() - make_interval(mins => p_stale_minutes);

  get diagnostics closed_count = row_count;
  return closed_count;
end;
$$;

grant execute on function public.close_stale_open_work_sessions(int) to authenticated;
