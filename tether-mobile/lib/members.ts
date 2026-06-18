import { getErrorMessage } from "./errors";
import { supabase } from "./supabase";

export type TetherMemberWithRole = {
  user_id: string;
  display_name: string;
  joined_at: string;
  can_manage_allowlist: boolean;
  is_creator: boolean;
};

export async function fetchTetherMembers(tetherId: string): Promise<TetherMemberWithRole[]> {
  const { data, error } = await supabase.rpc("get_tether_members", {
    p_tether_id: tetherId,
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to load members."));
  }

  return (data ?? []) as TetherMemberWithRole[];
}

export async function setMemberAllowlistPermission(
  tetherId: string,
  userId: string,
  canManage: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("set_member_allowlist_permission", {
    p_tether_id: tetherId,
    p_user_id: userId,
    p_can_manage: canManage,
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to update member permission."));
  }
}

export function canManageAllowlist(
  tether: { created_by: string },
  userId: string,
  members: TetherMemberWithRole[],
): boolean {
  if (tether.created_by === userId) return true;
  const member = members.find((row) => row.user_id === userId);
  return Boolean(member?.can_manage_allowlist);
}

export function memberRoleLabel(member: TetherMemberWithRole): string {
  if (member.is_creator) return "Admin";
  if (member.can_manage_allowlist) return "Can manage rules";
  return "Member";
}
