import { getErrorMessage } from "./errors";
import { supabase, type DetectedTool } from "./supabase";

export async function fetchDetectedApps(): Promise<DetectedTool[]> {
  const { data, error } = await supabase
    .from("detected_tools")
    .select("*")
    .eq("tool_type", "app")
    .eq("is_available", true)
    .order("display_name", { ascending: true });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to load detected apps."));
  }

  return data ?? [];
}

export async function fetchTetherDetectedApps(tetherId: string): Promise<DetectedTool[]> {
  const { data: members, error: membersError } = await supabase
    .from("tether_members")
    .select("user_id")
    .eq("tether_id", tetherId);

  if (membersError) {
    throw new Error(getErrorMessage(membersError, "Failed to load tether members."));
  }

  const memberIds = (members ?? []).map((member) => member.user_id);
  if (memberIds.length === 0) return [];

  const { data, error } = await supabase
    .from("detected_tools")
    .select("*")
    .eq("tool_type", "app")
    .eq("is_available", true)
    .in("user_id", memberIds)
    .order("display_name", { ascending: true });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to load tether detected apps."));
  }

  return data ?? [];
}
