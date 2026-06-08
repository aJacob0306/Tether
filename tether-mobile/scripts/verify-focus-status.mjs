/**
 * Verifies focus timer helpers (run after `npm install` in tether-mobile).
 * Usage: node scripts/verify-focus-status.mjs
 */

function getElapsedMs(startedAt, now) {
  return Math.max(0, now - new Date(startedAt).getTime());
}

function formatFocusDurationFromMs(ms) {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatFocusDuration(startedAt, now = Date.now()) {
  return formatFocusDurationFromMs(getElapsedMs(startedAt, now));
}

function getTotalOpenFocusMs(members, now = Date.now()) {
  return members.reduce((total, member) => {
    if (!member.openSession) return total;
    return total + getElapsedMs(member.openSession.started_at, now);
  }, 0);
}

function getLiveDailyFocusMs(members, dayStart, now = Date.now()) {
  const dayStartMs = dayStart.getTime();
  return members.reduce((total, member) => {
    if (!member.openSession || member.status !== "working") return total;

    const sessionUpdatedAtMs = new Date(member.openSession.updated_at).getTime();
    const incrementStartMs = Math.max(sessionUpdatedAtMs, dayStartMs);
    return total + Math.max(0, now - incrementStartMs);
  }, 0);
}

function getDailyWorkTotalMs(sessions, dayStart, dayEnd, now) {
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayEnd.getTime();

  return sessions.reduce((total, session) => {
    const sessionStartMs = new Date(session.started_at).getTime();
    const effectiveEndMs = session.ended_at
      ? new Date(session.ended_at).getTime()
      : Math.min(new Date(session.updated_at).getTime(), now);

    const clampedStartMs = Math.max(sessionStartMs, dayStartMs);
    const clampedEndMs = Math.min(effectiveEndMs, dayEndMs);
    return total + Math.max(0, clampedEndMs - clampedStartMs);
  }, 0);
}

function deriveStatus(updatedAt, openSessionUpdatedAt, now = Date.now()) {
  const activityAt = [updatedAt, openSessionUpdatedAt]
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  if (!activityAt) return "offline";
  const elapsed = now - new Date(activityAt).getTime();
  if (elapsed <= 2 * 60 * 1000) return "working";
  if (elapsed <= 15 * 60 * 1000) return "idle";
  return "offline";
}

const now = Date.parse("2026-05-30T12:00:00.000Z");
const dayStart = new Date("2026-05-30T00:00:00.000Z");
const dayEnd = new Date("2026-05-31T00:00:00.000Z");
const checks = [
  [formatFocusDuration("2026-05-30T11:48:00.000Z", now), "12m"],
  [formatFocusDuration("2026-05-30T10:56:00.000Z", now), "1h 4m"],
  [formatFocusDuration("2026-05-30T11:59:30.000Z", now), "<1m"],
  [deriveStatus(null, "2026-05-30T11:59:00.000Z", now), "working"],
  [deriveStatus(null, "2026-05-30T11:50:00.000Z", now), "idle"],
  [deriveStatus("2026-05-30T11:59:00.000Z", null, now), "working"],
  [deriveStatus("2026-05-30T11:50:00.000Z", null, now), "idle"],
  [deriveStatus(null, null, now), "offline"],
  [
    formatFocusDurationFromMs(
      getTotalOpenFocusMs(
        [
          { openSession: { started_at: "2026-05-30T11:48:00.000Z" } },
          { openSession: { started_at: "2026-05-30T11:54:00.000Z" } },
        ],
        now,
      ),
    ),
    "18m",
  ],
  [
    formatFocusDurationFromMs(
      getLiveDailyFocusMs(
        [
          {
            status: "working",
            openSession: { updated_at: "2026-05-30T11:58:00.000Z" },
          },
          {
            status: "idle",
            openSession: { updated_at: "2026-05-30T11:50:00.000Z" },
          },
        ],
        dayStart,
        now,
      ),
    ),
    "2m",
  ],
  [
    formatFocusDurationFromMs(
      getDailyWorkTotalMs(
        [
          {
            started_at: "2026-05-29T23:50:00.000Z",
            ended_at: "2026-05-30T00:10:00.000Z",
            updated_at: "2026-05-30T00:10:00.000Z",
          },
          {
            started_at: "2026-05-30T09:00:00.000Z",
            ended_at: "2026-05-30T09:30:00.000Z",
            updated_at: "2026-05-30T09:30:00.000Z",
          },
          {
            started_at: "2026-05-30T09:00:00.000Z",
            ended_at: "2026-05-30T09:30:00.000Z",
            updated_at: "2026-05-30T09:30:00.000Z",
          },
          {
            started_at: "2026-05-30T11:00:00.000Z",
            ended_at: null,
            updated_at: "2026-05-30T11:45:00.000Z",
          },
        ],
        dayStart,
        dayEnd,
        now,
      ),
    ),
    "1h 55m",
  ],
];

let failed = 0;
for (const [actual, expected] of checks) {
  if (actual !== expected) {
    console.error(`FAIL expected ${expected}, got ${actual}`);
    failed += 1;
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log("verify-focus-status: all checks passed");
