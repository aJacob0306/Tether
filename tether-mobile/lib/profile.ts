import { getErrorMessage } from "./errors";
import { supabase, type Profile, type Tether } from "./supabase";

export type ProfileWithActiveTether = Profile & {
  active_tether_id: string | null;
};

export type ActiveTetherOption = Pick<Tether, "id" | "name">;

export async function fetchMyProfile(): Promise<ProfileWithActiveTether | null> {
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

export async function updateMyDisplayName(displayName: string): Promise<ProfileWithActiveTether> {
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

export async function ensureMyActiveTether(): Promise<string | null> {
  const { data, error } = await supabase.rpc("ensure_my_active_tether");

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to sync active tether."));
  }

  return (data as string | null) ?? null;
}

export async function setMyActiveTether(tetherId: string | null): Promise<string | null> {
  const { data, error } = await supabase.rpc("set_my_active_tether", {
    p_tether_id: tetherId,
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to set active tether."));
  }

  return (data as string | null) ?? null;
}

export async function fetchMyActiveTetherOptions(): Promise<{
  activeTetherId: string | null;
  tethers: ActiveTetherOption[];
}> {
  const activeTetherId = await ensureMyActiveTether();

  const { data, error } = await supabase
    .from("tether_members")
    .select("tethers(id, name)")
    .order("joined_at", { ascending: false });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to load tethers."));
  }

  type Row = { tethers: ActiveTetherOption | ActiveTetherOption[] | null };
  const tethers: ActiveTetherOption[] = [];
  const seen = new Set<string>();

  ((data ?? []) as Row[]).forEach((row) => {
    const tether = Array.isArray(row.tethers) ? row.tethers[0] : row.tethers;
    if (!tether || seen.has(tether.id)) return;
    seen.add(tether.id);
    tethers.push(tether);
  });

  tethers.sort((a, b) => a.name.localeCompare(b.name));

  return { activeTetherId, tethers };
}
