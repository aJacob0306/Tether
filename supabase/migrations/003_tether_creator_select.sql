-- Fix: creators must read their tether row before they are added to tether_members.
-- Without this, insert(...).select() returns 0 rows and create fails.

create policy "Creators can view their tethers"
  on public.tethers
  for select
  using (created_by = auth.uid());
