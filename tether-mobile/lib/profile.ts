import { getErrorMessage } from "./errors";
import { supabase, type Profile } from "./supabase";

export async function fetchMyProfile(): Promise<Profile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to load profile."));
  }

  return data;
}

export async function updateMyDisplayName(displayName: string): Promise<Profile> {
  const trimmed = displayName.trim();
  if (!trimmed) {
    throw new Error("Enter a display name.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not signed in.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: trimmed })
    .eq("id", user.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to update display name."));
  }

  return data;
}
