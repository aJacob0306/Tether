-- Per-domain work sessions for focus time stats (Option B: one session per domain segment).

create table public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  domain text not null,
  url text not null default '',
  title text not null default '',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.work_sessions enable row level security;

create policy "Users manage own work sessions"
  on public.work_sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Tether peers can view work sessions"
  on public.work_sessions
  for select
  using (public.shares_tether_with(auth.uid(), user_id));

create index work_sessions_user_started_idx
  on public.work_sessions (user_id, started_at desc);

create index work_sessions_user_domain_idx
  on public.work_sessions (user_id, domain);

-- At most one open session (ended_at is null) per user.
create unique index work_sessions_one_open_per_user_idx
  on public.work_sessions (user_id)
  where ended_at is null;
