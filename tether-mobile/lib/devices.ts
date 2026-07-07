import { getErrorMessage } from "./errors";
import { supabase } from "./supabase";

export const RECENT_DESKTOP_HEARTBEAT_MS = 5 * 60 * 1000;

export type DeviceStatusRow = {
  device_id: string;
  device_type: "desktop" | "extension";
  platform: string;
  display_name: string;
  app_version: string | null;
  last_seen_at: string;
  revoked_at: string | null;
  is_recent: boolean;
};

export type DeviceStatusSummary = {
  devices: DeviceStatusRow[];
  desktopDevices: DeviceStatusRow[];
  recentDesktopDevice: DeviceStatusRow | null;
  hasRecentDesktop: boolean;
  desktopLastSeenAt: string | null;
};

function summarizeDeviceStatus(rows: DeviceStatusRow[]): DeviceStatusSummary {
  const desktopDevices = rows
    .filter((device) => device.device_type === "desktop")
    .sort(
      (a, b) =>
        new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime(),
    );
  const recentDesktopDevice =
    desktopDevices.find((device) => device.is_recent && !device.revoked_at) ?? null;

  return {
    devices: rows,
    desktopDevices,
    recentDesktopDevice,
    hasRecentDesktop: Boolean(recentDesktopDevice),
    desktopLastSeenAt: desktopDevices[0]?.last_seen_at ?? null,
  };
}

export async function fetchMyDeviceStatus(
  recentMs = RECENT_DESKTOP_HEARTBEAT_MS,
): Promise<DeviceStatusSummary> {
  const recentAfter = new Date(Date.now() - recentMs).toISOString();
  const { data, error } = await supabase.rpc("get_my_device_status", {
    p_recent_after: recentAfter,
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to load device status."));
  }

  return summarizeDeviceStatus(((data ?? []) as DeviceStatusRow[]) ?? []);
}
