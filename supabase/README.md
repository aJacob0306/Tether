# Supabase migrations

SQL migrations for the Tether Supabase project live in `migrations/`.

## Apply to your project

### Option A: Supabase Dashboard (quickest)

1. Open your project at [supabase.com/dashboard](https://supabase.com/dashboard)
2. Go to **SQL Editor**
3. Paste the contents of each migration file in order
4. Click **Run**

### Option B: Supabase CLI

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

## Migrations

| File | Description |
|------|-------------|
| `001_profiles.sql` | `profiles` table, RLS, auto-create profile on sign-up |
| `002_tethers.sql` | `tethers`, `tether_members`, `active_tabs`, peer RLS, Realtime, `join_tether_by_code` RPC |
| `003_tether_creator_select.sql` | Fix RLS so tether creation can return the new row (required for create flow) |
| `004_fix_tether_members_rls.sql` | Fix infinite recursion in `tether_members` RLS policies |
| `005_backfill_profiles.sql` | Create missing `profiles` rows for existing/manual auth users |
| `006_tether_board_rpc.sql` | Secure board loader that returns member names and active tabs for a tether |
| `007_work_sessions.sql` | Per-domain work sessions for focus time and top-site stats |
| `008_tether_board_sessions.sql` | Board RPC includes open work session fields; Realtime on `work_sessions` |
| `009_active_tabs_updated_at_trigger.sql` | Keeps `active_tabs.updated_at` fresh on every tab sync |
| `010_work_sessions_updated_at.sql` | Adds `work_sessions.updated_at` freshness tracking and updates the board RPC |
| `011_tether_daily_work_total.sql` | Adds daily per-member work-time aggregation for the board timer |

Apply migrations in order. After `002_tethers.sql`, group members can see each other's active tabs and profiles when they share a tether.
