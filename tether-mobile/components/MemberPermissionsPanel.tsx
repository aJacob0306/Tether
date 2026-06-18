import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Switch, Text, View } from "react-native";
import { appStyles } from "../constants/styles";
import {
  fetchTetherMembers,
  memberRoleLabel,
  setMemberAllowlistPermission,
  type TetherMemberWithRole,
} from "../lib/members";
import { SettingsRow, SettingsSection } from "./SettingsSection";

type MemberPermissionsPanelProps = {
  tetherId: string;
  currentUserId: string;
};

export function MemberPermissionsPanel({
  tetherId,
  currentUserId,
}: MemberPermissionsPanelProps) {
  const [members, setMembers] = useState<TetherMemberWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setError("");
    try {
      const data = await fetchTetherMembers(tetherId);
      setMembers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load members.");
    } finally {
      setLoading(false);
    }
  }, [tetherId]);

  useEffect(() => {
    setLoading(true);
    loadMembers();
  }, [loadMembers]);

  async function handleToggle(member: TetherMemberWithRole, enabled: boolean) {
    setUpdatingUserId(member.user_id);
    setError("");

    try {
      await setMemberAllowlistPermission(tetherId, member.user_id, enabled);
      setMembers((prev) =>
        prev.map((row) =>
          row.user_id === member.user_id
            ? { ...row, can_manage_allowlist: enabled }
            : row,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update permission.");
    } finally {
      setUpdatingUserId(null);
    }
  }

  if (loading) {
    return <ActivityIndicator style={appStyles.tabLoader} size="large" />;
  }

  return (
    <>
      <SettingsSection
        title="Members & permissions"
        footer="Admins can let other members add or remove allowed apps and websites."
      >
        {members.map((member, index) => {
        const isSelf = member.user_id === currentUserId;
        const last = index === members.length - 1;

        return (
          <SettingsRow
            key={member.user_id}
            label={member.display_name + (isSelf ? " (you)" : "")}
            value={memberRoleLabel(member)}
            hint={
              member.is_creator
                ? "Full control over this workspace"
                : "Allow editing the work allowlist"
            }
            last={last}
          >
            {member.is_creator ? (
              <View style={appStyles.settingsRoleBadge}>
                <Text style={appStyles.settingsRoleBadgeText}>Admin</Text>
              </View>
            ) : updatingUserId === member.user_id ? (
              <ActivityIndicator size="small" color="#e6b4ff" />
            ) : (
              <Switch
                value={member.can_manage_allowlist}
                onValueChange={(enabled) => handleToggle(member, enabled)}
                trackColor={{ false: "#2d2f31", true: "#945cb4" }}
                thumbColor="#fff"
              />
            )}
          </SettingsRow>
        );
      })}
      </SettingsSection>
      {error ? <Text style={appStyles.error}>{error}</Text> : null}
    </>
  );
}
