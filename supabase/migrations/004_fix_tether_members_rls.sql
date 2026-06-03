-- Fix infinite recursion: tether_members SELECT policy must not query tether_members
-- under RLS. Use a SECURITY DEFINER helper instead.

create or replace function public.is_tether_member(p_tether_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tether_members
    where tether_id = p_tether_id
      and user_id = p_user_id
  );
$$;

drop policy if exists "Members can view tether membership" on public.tether_members;

create policy "Members can view tether membership"
  on public.tether_members
  for select
  using (public.is_tether_member(tether_id, auth.uid()));

drop policy if exists "Members can view their tethers" on public.tethers;

create policy "Members can view their tethers"
  on public.tethers
  for select
  using (public.is_tether_member(id, auth.uid()));
