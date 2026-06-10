import { getErrorMessage } from "./errors";
import {
  supabase,
  type AllowedTarget,
  type AllowedTargetType,
  type DetectedTool,
} from "./supabase";

export function normalizeAllowlistValue(
  targetType: AllowedTargetType,
  raw: string,
): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  if (targetType === "app") {
    return trimmed;
  }

  try {
    const withProtocol = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
    const hostname = new URL(withProtocol).hostname.toLowerCase();
    return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  } catch {
    const lowered = trimmed.toLowerCase();
    return lowered.startsWith("www.") ? lowered.slice(4) : lowered;
  }
}

export async function fetchTetherAllowlist(tetherId: string): Promise<AllowedTarget[]> {
  const { data, error } = await supabase
    .from("tether_allowed_targets")
    .select("*")
    .eq("tether_id", tetherId)
    .order("target_type", { ascending: true })
    .order("value", { ascending: true });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to load allowlist."));
  }

  return data ?? [];
}

export async function addTetherAllowlistEntry(
  tetherId: string,
  targetType: AllowedTargetType,
  rawValue: string,
): Promise<AllowedTarget> {
  const value = normalizeAllowlistValue(targetType, rawValue);
  if (!value) {
    throw new Error(
      targetType === "app" ? "Enter an app name." : "Enter a website domain.",
    );
  }

  const { data, error } = await supabase
    .from("tether_allowed_targets")
    .insert({
      tether_id: tetherId,
      target_type: targetType,
      value,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("That target is already on the allowlist.");
    }
    throw new Error(getErrorMessage(error, "Failed to add allowlist entry."));
  }

  return data;
}

export async function addDetectedAppAllowlistEntry(
  tetherId: string,
  app: DetectedTool,
): Promise<AllowedTarget> {
  const value = normalizeAllowlistValue("app", app.value);
  if (!value) {
    throw new Error("Select an app.");
  }

  const { data, error } = await supabase
    .from("tether_allowed_targets")
    .insert({
      tether_id: tetherId,
      target_type: "app",
      value,
      detected_tool_id: app.id,
      display_name: app.display_name,
      bundle_identifier: app.bundle_identifier,
      platform: app.platform,
      metadata: {
        source: "desktop_discovery",
        installPath: app.install_path,
        toolKey: app.tool_key,
        ...app.metadata,
      },
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("That app is already on the allowlist.");
    }
    throw new Error(getErrorMessage(error, "Failed to add app."));
  }

  return data;
}

export async function removeTetherAllowlistEntry(entryId: string): Promise<void> {
  const { error } = await supabase.from("tether_allowed_targets").delete().eq("id", entryId);

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to remove allowlist entry."));
  }
}

export function allowlistTypeLabel(targetType: AllowedTargetType): string {
  return targetType === "app" ? "App" : "Website";
}
