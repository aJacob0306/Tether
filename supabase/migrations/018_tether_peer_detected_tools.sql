-- Allow tether peers to view each other's detected desktop apps for shared allowlist setup.

create policy "Tether peers can view detected tools"
  on public.detected_tools
  for select
  using (public.shares_tether_with(auth.uid(), user_id));
