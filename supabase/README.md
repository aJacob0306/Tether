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

Apply migrations in order. After `002_tethers.sql`, group members can see each other's active tabs and profiles when they share a tether.
