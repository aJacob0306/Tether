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
   - Create a user under **Authentication → Users → Add user** with email + password

3. Load in Chrome:
   - Open `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked**
   - Select this `tether-extension` folder

4. Click the Tether extension icon and sign in.

5. Switch tabs and verify the row updates in Supabase **Table Editor → active_tabs**.

## Notes

- Chrome extensions cannot read `.env` files directly. Use `config.js` instead (gitignored).
- Internal Chrome pages (`chrome://`, etc.) are not synced.
