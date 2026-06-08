import { deriveStatus } from "./status";
import { getErrorMessage } from "./errors";
import {
  supabase,
  type ActiveTab,
  type DailyMemberLog,
  type DailyTopDomain,
  type MemberActivity,
  type OpenWorkSession,
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
    session_started_at: string | null;
    session_updated_at: string | null;
    session_domain: string | null;
    session_url: string | null;
    session_title: string | null;
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

    const openSession: OpenWorkSession | null = row.session_started_at
      ? {
          started_at: row.session_started_at,
          updated_at: row.session_updated_at ?? row.session_started_at,
          domain: row.session_domain ?? "",
          url: row.session_url ?? "",
          title: row.session_title ?? "",
        }
      : null;

    uniqueMembers.set(row.user_id, {
      user_id: row.user_id,
      display_name: row.display_name ?? "Tether User",
      activeTab,
      openSession,
      status: deriveStatus(activeTab?.updated_at, openSession?.updated_at),
    });
  });

  return Array.from(uniqueMembers.values());
}

export async function fetchTetherDailyWorkTotal(
  tetherId: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<number> {
  const { data, error } = await supabase.rpc("get_tether_daily_work_total", {
    p_tether_id: tetherId,
    p_day_start: dayStart.toISOString(),
    p_day_end: dayEnd.toISOString(),
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to load daily work timer."));
  }

  return Number(data ?? 0);
}

function parseTopDomains(value: unknown): DailyTopDomain[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((domain) => {
      if (!domain || typeof domain !== "object") return null;
      const row = domain as { domain?: unknown; work_ms?: unknown };
      if (typeof row.domain !== "string") return null;

      return {
        domain: row.domain,
        workMs: Number(row.work_ms ?? 0),
      };
    })
    .filter((domain): domain is DailyTopDomain => domain != null);
}

export async function fetchTetherDailyMemberLogs(
  tetherId: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<DailyMemberLog[]> {
  const { data, error } = await supabase.rpc("get_tether_daily_member_logs", {
    p_tether_id: tetherId,
    p_day_start: dayStart.toISOString(),
    p_day_end: dayEnd.toISOString(),
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to load detailed log."));
  }

  type LogRow = {
    user_id: string;
    display_name: string | null;
    total_work_ms: number | string | null;
    top_domains: unknown;
  };

  return ((data ?? []) as LogRow[]).map((row) => ({
    user_id: row.user_id,
    display_name: row.display_name ?? "Tether User",
    totalWorkMs: Number(row.total_work_ms ?? 0),
    topDomains: parseTopDomains(row.top_domains),
  }));
}
