import type { WorkStatus } from "./supabase";

const WORKING_MS = 2 * 60 * 1000;
const IDLE_MS = 15 * 60 * 1000;

export function deriveStatus(updatedAt: string | null | undefined): WorkStatus {
  if (!updatedAt) return "offline";

  const elapsed = Date.now() - new Date(updatedAt).getTime();
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
