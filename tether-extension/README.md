# Tether Chrome Extension

Syncs your active Chrome tab to Supabase so the Tether mobile app can display it.

## Setup

1. Copy `config.example.js` to `config.js` and add your Supabase URL and publishable (anon) key:

   ```javascript
   export const SUPABASE_URL = "https://xxxxx.supabase.co";
   export const SUPABASE_ANON_KEY = "sb_publishable_...";
   ```

2. In Supabase:
   - Enable **Email** auth under **Authentication → Providers**
   - Apply migrations from [`../supabase/migrations/`](../supabase/migrations/) (see [`../supabase/README.md`](../supabase/README.md))
   - Create the `active_tabs` table if not already present (see below)

3. Load in Chrome:
   - Open `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked**
   - Select this `tether-extension` folder

4. Create an account in the **Tether mobile app** (Sign up), then sign into the extension with the same email and password.

5. Switch tabs and verify the row updates in Supabase **Table Editor → active_tabs**.

## Auth

- **Sign-up** happens in the mobile app, not the extension.
- The extension is **login-only** and refreshes expired sessions automatically before syncing tabs.

### Email confirmation

In **Authentication → Providers → Email**:

- **Confirm email OFF** (typical for MVP): mobile sign-up logs the user in immediately.
- **Confirm email ON**: after sign-up, the mobile app shows a “Check your email” screen; the user must confirm before signing in.

## active_tabs table

If you have not created this table yet, run in the SQL Editor:

```sql
create table public.active_tabs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  url text not null default '',
  title text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.active_tabs enable row level security;

create policy "Users manage own active tab"
  on public.active_tabs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

Enable **Realtime** for `active_tabs` under **Database → Publications** (supabase_realtime) so the mobile app receives live updates.

## Notes

- Chrome extensions cannot read `.env` files directly. Use `config.js` instead (gitignored).
- Internal Chrome pages (`chrome://`, etc.) are not synced.
