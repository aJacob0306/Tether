-- Keep active_tabs.updated_at fresh on every tab change so status + Realtime stay accurate.

create or replace function public.touch_active_tab_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists active_tabs_touch_updated_at on public.active_tabs;

create trigger active_tabs_touch_updated_at
  before insert or update on public.active_tabs
  for each row
  execute function public.touch_active_tab_updated_at();
