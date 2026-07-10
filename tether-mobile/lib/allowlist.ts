import { getErrorMessage } from "./errors";
import {
  supabase,
  type AllowedTarget,
  type AllowedTargetType,
  type DetectedTool,
} from "./supabase";

export type AllowlistConflict = {
  tetherId: string;
  tetherName: string;
  value: string;
  displayName: string | null;
};

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

export async function findMyAllowlistConflicts(
  tetherId: string,
  targetType: AllowedTargetType,
  rawValue: string,
  bundleIdentifier?: string | null,
): Promise<AllowlistConflict[]> {
  const value = normalizeAllowlistValue(targetType, rawValue);
  if (!value) return [];

  const { data, error } = await supabase.rpc("find_my_allowlist_conflicts", {
    p_tether_id: tetherId,
    p_target_type: targetType,
    p_value: value,
    p_bundle_identifier: bundleIdentifier ?? null,
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to check allowlist conflicts."));
  }

  type Row = {
    tether_id: string;
    tether_name: string;
    value: string;
    display_name: string | null;
  };

  return ((data ?? []) as Row[]).map((row) => ({
    tetherId: row.tether_id,
    tetherName: row.tether_name,
    value: row.value,
    displayName: row.display_name,
  }));
}

export async function findMyExistingAllowlistTargets(
  targetType: AllowedTargetType,
  rawValue: string,
  bundleIdentifier?: string | null,
): Promise<AllowlistConflict[]> {
  const value = normalizeAllowlistValue(targetType, rawValue);
  if (!value) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: memberships, error: memberError } = await supabase
    .from("tether_members")
    .select("tether_id, tethers(id, name)")
    .eq("user_id", user.id);

  if (memberError) {
    throw new Error(getErrorMessage(memberError, "Failed to check allowlist conflicts."));
  }

  const tetherIds = (memberships ?? [])
    .map((row: { tether_id: string }) => row.tether_id)
    .filter(Boolean);

  if (!tetherIds.length) return [];

  let query = supabase
    .from("tether_allowed_targets")
    .select("tether_id, value, display_name, bundle_identifier, tethers(id, name)")
    .in("tether_id", tetherIds)
    .eq("target_type", targetType);

  const { data, error } = await query;
  if (error) {
    throw new Error(getErrorMessage(error, "Failed to check allowlist conflicts."));
  }

  type Row = {
    tether_id: string;
    value: string;
    display_name: string | null;
    bundle_identifier: string | null;
    tethers: { id: string; name: string } | { id: string; name: string }[] | null;
  };

  const conflicts: AllowlistConflict[] = [];
  const seen = new Set<string>();
  const normalizedValue = value.toLowerCase();
  const normalizedBundle = bundleIdentifier?.trim() || null;

  ((data ?? []) as Row[]).forEach((row) => {
    const matchesValue = row.value.trim().toLowerCase() === normalizedValue;
    const matchesBundle =
      targetType === "app" &&
      Boolean(normalizedBundle) &&
      Boolean(row.bundle_identifier) &&
      row.bundle_identifier === normalizedBundle;

    if (!matchesValue && !matchesBundle) return;

    const tether = Array.isArray(row.tethers) ? row.tethers[0] : row.tethers;
    if (!tether || seen.has(tether.id)) return;
    seen.add(tether.id);
    conflicts.push({
      tetherId: tether.id,
      tetherName: tether.name,
      value: row.value,
      displayName: row.display_name,
    });
  });

  return conflicts;
}

export function formatAllowlistConflictMessage(
  targetLabel: string,
  conflicts: AllowlistConflict[],
): string {
  if (!conflicts.length) return "";

  const names = conflicts.map((conflict) => conflict.tetherName);
  const tetherList =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

  return `${targetLabel} is already allowed in ${tetherList}. Time on this tool can only count toward one tether at a time — pick your active tether in Settings when you use it.`;
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
