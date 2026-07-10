# Tether

Peer accountability app — stay focused together by making work activity visible inside shared groups.

## Projects

| Folder | Description |
|--------|-------------|
| [`tether-mobile/`](tether-mobile/) | Expo mobile app (sign-up, tethers, group board) |
| [`tether-extension/`](tether-extension/) | Chrome extension (syncs active tab to Supabase) |
| [`tether-desktop/`](tether-desktop/) | Electron desktop companion (macOS + Windows: detects installed apps and tracks allowlisted desktop apps) |
| [`supabase/`](supabase/) | Database migrations |

## Planning docs

- [`docs/architecture.md`](docs/architecture.md) explains how the mobile app, Chrome extension, desktop companion, and Supabase backend fit together.
- [`docs/readiness-checklist.md`](docs/readiness-checklist.md) lists the checks to complete before closed beta or marketing.
- [`docs/closed-beta-playbook.md`](docs/closed-beta-playbook.md) defines the one-week beta test, accuracy checks, and exit criteria.
- [`docs/observability-plan.md`](docs/observability-plan.md) recommends the minimal Sentry, PostHog, and Supabase logging setup.
- [`docs/build-vs-buy.md`](docs/build-vs-buy.md) records what should stay custom and what services to revisit later.

## Getting started

1. Create a Supabase project and apply migrations from [`supabase/migrations/`](supabase/migrations/) in order — see [`supabase/README.md`](supabase/README.md).
2. Configure the mobile app: copy `tether-mobile/.env.example` to `.env` and add your Supabase URL and anon key.
3. Configure the extension: copy `tether-extension/config.example.js` to `config.js` — see [`tether-extension/README.md`](tether-extension/README.md).
4. Configure the desktop companion: copy `tether-desktop/.env.example` to `.env` — see [`tether-desktop/README.md`](tether-desktop/README.md).
5. Sign up in the mobile app, sign into the desktop companion (Mac or Windows), then create a tether and select detected apps.
6. As the tether creator, open **Rules** and add or remove allowed websites and apps from any member's synced inventory.
7. Each member signs into the Chrome extension with the same account. Only allowlisted sites sync.

```bash
cd tether-mobile && npm install && npm start
```

```bash
cd tether-desktop && npm install && npm start
```

## Tether flow

1. **Create tether** — pick a name, get an invite code
2. **Join tether** — enter a friend's invite code
3. **Set rules** — creator adds allowed apps and websites for the project
4. **Open the board** — see each member's status when they're on an allowed target
5. **Push alerts** — when someone starts on an allowlisted site or desktop app, tether peers get a phone notification

## iOS dev build (required for push)

Push does not work in Expo Go. Build a development client:

```bash
cd tether-mobile
npx eas-cli build --profile development --platform ios
```

Install the build on each iPhone, allow notifications, and sign in. See [`supabase/README.md`](supabase/README.md) for the push edge function deploy step.
