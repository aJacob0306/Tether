import { deriveStatus } from "./status";
import { getErrorMessage } from "./errors";
import {
  supabase,
  type ActiveTab,
  type MemberActivity,
  type Tether,
} from "./supabase";

const INVITE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateInviteCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)];
  }
  return code;
}

export async function fetchMyTethers(): Promise<Tether[]> {
  const { data, error } = await supabase
    .from("tether_members")
    .select("tethers(*)")
    .order("joined_at", { ascending: false });

  if (error) throw error;

  type Row = { tethers: Tether | Tether[] | null };
  const rows = (data ?? []) as Row[];

  const uniqueTethers = new Map<string, Tether>();

  rows
    .map((row) => (Array.isArray(row.tethers) ? row.tethers[0] : row.tethers))
    .filter((tether): tether is Tether => tether != null)
    .forEach((tether) => uniqueTethers.set(tether.id, tether));

  return Array.from(uniqueTethers.values());
}

export async function createTether(name: string): Promise<Tether> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Enter a tether name.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not signed in.");
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inviteCode = generateInviteCode();
    const { data: tether, error: tetherError } = await supabase
      .from("tethers")
      .insert({
        name: trimmedName,
        invite_code: inviteCode,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (tetherError) {
      if (tetherError.code === "23505") continue;
      throw new Error(getErrorMessage(tetherError, "Failed to create tether."));
    }

    const { error: memberError } = await supabase.from("tether_members").insert({
      tether_id: tether.id,
      user_id: user.id,
    });

    if (memberError) {
      throw new Error(getErrorMessage(memberError, "Failed to join tether as creator."));
    }

    return tether;
  }

  throw new Error("Could not generate invite code. Try again.");
}

export async function joinTether(inviteCode: string): Promise<string> {
  const normalized = inviteCode.trim().toUpperCase();
  if (!normalized) {
    throw new Error("Enter an invite code.");
  }

  const { data, error } = await supabase.rpc("join_tether_by_code", {
    p_invite_code: normalized,
  });

  if (error) {
    if (error.message.includes("Invalid invite code")) {
      throw new Error("Invalid invite code.");
    }
    throw error;
  }

  return data as string;
}

export async function fetchTether(tetherId: string): Promise<Tether> {
  const { data, error } = await supabase
    .from("tethers")
    .select("*")
    .eq("id", tetherId)
    .single();

  if (error) throw error;
  return data;
}

export async function fetchTetherBoard(tetherId: string): Promise<MemberActivity[]> {
  const { data, error } = await supabase.rpc("get_tether_board", {
    p_tether_id: tetherId,
  });

  if (error) throw error;

  type BoardRow = {
    user_id: string;
    display_name: string | null;
    url: string | null;
    title: string | null;
    updated_at: string | null;
  };

  const uniqueMembers = new Map<string, MemberActivity>();

  ((data ?? []) as BoardRow[]).forEach((row) => {
    const activeTab: ActiveTab | null = row.updated_at
      ? {
          user_id: row.user_id,
          url: row.url ?? "",
          title: row.title ?? "",
          updated_at: row.updated_at,
        }
      : null;

    uniqueMembers.set(row.user_id, {
      user_id: row.user_id,
      display_name: row.display_name ?? "Tether User",
      activeTab,
      status: deriveStatus(activeTab?.updated_at),
    });
  });

  return Array.from(uniqueMembers.values());
}
