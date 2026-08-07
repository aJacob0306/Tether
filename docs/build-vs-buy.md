# Build vs Buy Review

This review answers the question: "Would Tether be better if some custom code were replaced with APIs?"

Short answer: yes for some support systems, no for the core tracking loop right now.

## Decision Rule

Use managed APIs when they reduce operational burden around non-core infrastructure. Keep custom code where the behavior is the product advantage: detecting focused work and making it visible to trusted peers.

## Keep Custom For Now

### Browser Activity Tracking

Keep the Chrome extension custom.

Why:

- Browser tab access requires Chrome extension APIs.
- Tether only syncs allowlisted activity, which is part of the trust model.
- A generic time-tracking API may capture more than Tether needs and create privacy concerns.

Revisit only if:

- Extension maintenance becomes the main blocker.
- Chrome Web Store policy changes make the current approach unreliable.
- Users ask to import browser activity from an existing tool.

### Desktop App Tracking

Keep the desktop companion custom through the closed beta.

Why:

- Foreground-app detection is platform-specific.
- The app inventory is used for tether allowlist setup, not just reporting.
- This is central to the product promise.

Revisit only if:

- macOS or Windows detection becomes too brittle to maintain.
- Users already use a time tracker they want to connect.
- Packaging and auto-updates become more important than custom detection.

Potential alternatives later:

- ActivityWatch for local activity collection.
- Timing for macOS time-tracking import.
- RescueTime for cross-device time-tracking import.

### Tether Permissions

Keep Supabase RLS and RPCs for now.

Why:

- Current roles are simple: creator, member, and delegated allowlist manager.
- Supabase already protects direct client access through RLS.
- A dedicated authorization service would add another system before the product needs it.

Revisit only if:

- Tethers get teams, organizations, billing roles, admins, moderators, or audit logs.
- Permission rules become hard to reason about in SQL.
- Enterprise customers require policy management.

Potential alternatives later:

- Permit.io.
- Oso.
- Auth0 FGA.
- SpiceDB.

## Consider Soon

### Error Tracking

Recommendation: add Sentry before public marketing.

Why:

- Tether has three clients and platform-specific failure modes.
- Beta users will not reliably send useful console logs.
- Crashes and sync failures directly affect trust.

Start with:

- Mobile app crashes.
- Desktop companion platform detection errors.
- Chrome extension auth and sync errors.
- Push edge function failures.

### Product Analytics

Recommendation: add PostHog before public marketing.

Why:

- The biggest product risk is setup complexity.
- You need to know where users drop out before spending on marketing.

Start with activation events only:

- Sign up.
- Create or join tether.
- Add allowed target.
- Sign into extension.
- Sign into desktop companion.
- Start first work session.
- Return the next day.

### Branded Auth Email

Recommendation: consider before inviting users outside the trusted beta.

Why:

- Default auth emails can feel unfinished.
- Confirmation and recovery emails affect trust.

Potential providers:

- Resend.
- Postmark.
- SendGrid.

This can be done through Supabase custom SMTP without replacing Supabase Auth.

## Consider Later

### Notification Orchestration

Keep the current Expo Push plus Supabase Edge Function flow for beta.

Consider OneSignal, Knock, or Novu later if you need:

- Per-user notification preferences.
- Email fallback.
- Delivery analytics.
- Retry workflows.
- Notification templates managed outside code.

### Desktop Packaging And Updates

The companion builds with PyInstaller today (see `tether-desktop-py/packaging/`), which produces a working bundle but no auto-update and no signing. Before non-technical users install it, budget for an Apple Developer account for notarization and an Authenticode certificate for Windows, and consider a hosted update service.

This is not exactly an API replacement, but it will matter before non-technical users install the desktop companion.

### Time-Series Rollups

Keep SQL aggregations for now.

Consider scheduled rollups, Supabase Cron, Trigger.dev, Inngest, Tinybird, or TimescaleDB later if:

- Daily and weekly totals become slow.
- The app needs longer historical reports.
- The board creates too much repeated aggregation load.

## Do Not Add Yet

- A custom Node backend.
- A complex event pipeline.
- A dedicated authorization service.
- A full notification platform.
- A third-party time tracker as the primary data source.
- Payments, search, OCR, transcription, or AI services unless the product direction changes.

## Practical Sequence

1. Finish readiness verification.
2. Run the closed beta.
3. Add Sentry.
4. Add minimal PostHog analytics.
5. Fix trust-breaking tracking issues.
6. Improve onboarding and distribution.
7. Revisit notification orchestration, branded email, packaging, and time-tracking imports only after beta feedback shows the need.
