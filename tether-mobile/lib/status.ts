import type { MemberActivity, WorkStatus } from "./supabase";

const WORKING_MS = 2 * 60 * 1000;
const IDLE_MS = 15 * 60 * 1000;

export type LocalDayWindow = {
  dayStart: Date;
  dayEnd: Date;
};

export function getElapsedMs(startedAt: string, now = Date.now()): number {
  return Math.max(0, now - new Date(startedAt).getTime());
}

export function getLocalDayWindow(now = new Date()): LocalDayWindow {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  return { dayStart, dayEnd };
}

export function formatFocusDurationFromMs(ms: number): string {
  const minutes = Math.floor(ms / 60_000);

  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function formatFocusDuration(startedAt: string, now = Date.now()): string {
  return formatFocusDurationFromMs(getElapsedMs(startedAt, now));
}

export function getTotalOpenFocusMs(
  members: Pick<MemberActivity, "openSession">[],
  now = Date.now(),
): number {
  return members.reduce((total, member) => {
    if (!member.openSession) return total;
    return total + getElapsedMs(member.openSession.started_at, now);
  }, 0);
}

export function getLiveDailyFocusMs(
  members: Pick<MemberActivity, "openSession" | "status">[],
  dayStart: Date,
  now = Date.now(),
): number {
  const dayStartMs = dayStart.getTime();

  return members.reduce((total, member) => {
    if (!member.openSession || member.status !== "working") return total;

    const sessionUpdatedAtMs = new Date(member.openSession.updated_at).getTime();
    const incrementStartMs = Math.max(sessionUpdatedAtMs, dayStartMs);
    return total + Math.max(0, now - incrementStartMs);
  }, 0);
}

export function deriveStatus(
  updatedAt: string | null | undefined,
  openSessionUpdatedAt?: string | null,
): WorkStatus {
  const timestamps = [updatedAt, openSessionUpdatedAt].filter(
    (timestamp): timestamp is string => Boolean(timestamp),
  );
  const activityAt = timestamps.sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime(),
  )[0];

  if (!activityAt) return "offline";

  const elapsed = Date.now() - new Date(activityAt).getTime();
  if (elapsed <= WORKING_MS) return "working";
  if (elapsed <= IDLE_MS) return "idle";
  return "offline";
}

export function formatRelativeTime(updatedAt: string | null | undefined): string {
  if (!updatedAt) return "Never";

  const elapsedMs = Date.now() - new Date(updatedAt).getTime();
  const elapsedSec = Math.floor(elapsedMs / 1000);

  if (elapsedSec < 60) return "Just now";
  if (elapsedSec < 3600) return `${Math.floor(elapsedSec / 60)} min ago`;
  if (elapsedSec < 86400) return `${Math.floor(elapsedSec / 3600)} hr ago`;
  return `${Math.floor(elapsedSec / 86400)} d ago`;
}

export function statusLabel(status: WorkStatus): string {
  switch (status) {
    case "working":
      return "Working";
    case "idle":
      return "Idle";
    default:
      return "Offline";
  }
}
