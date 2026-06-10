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
