# Tether

Peer accountability app — stay focused together by making work activity visible inside shared groups.

## Projects

| Folder | Description |
|--------|-------------|
| [`tether-mobile/`](tether-mobile/) | Expo mobile app (sign-up, tethers, group board) |
| [`tether-extension/`](tether-extension/) | Chrome extension (syncs active tab to Supabase) |
| [`supabase/`](supabase/) | Database migrations |

## Getting started

1. Create a Supabase project and apply migrations from [`supabase/migrations/`](supabase/migrations/) in order — see [`supabase/README.md`](supabase/README.md).
2. Configure the mobile app: copy `tether-mobile/.env.example` to `.env` and add your Supabase URL and anon key.
3. Configure the extension: copy `tether-extension/config.example.js` to `config.js` — see [`tether-extension/README.md`](tether-extension/README.md).
4. Sign up in the mobile app, create a tether, and share the invite code with your group.
5. Each member signs into the Chrome extension with the same account so tabs sync to the group board.

```bash
cd tether-mobile && npm install && npm start
```

## Tether flow

1. **Create tether** — pick a name, get an invite code
2. **Join tether** — enter a friend's invite code
3. **Open the board** — see each member's status (Working / Idle / Offline) and current tab title, updating live
