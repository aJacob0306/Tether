import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Switch, Text, View } from "react-native";
import { colors, spacing, typography } from "../constants/theme";
import { Badge, Card, ListRow, SectionHeader } from "./ui";
import {
  fetchTetherMembers,
  memberRoleLabel,
  setMemberAllowlistPermission,
  type TetherMemberWithRole,
} from "../lib/members";

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

  return (
    <View style={styles.container}>
      <SectionHeader title="Members & permissions" />
      {loading ? (
        <ActivityIndicator
          style={styles.loader}
          size="large"
          color={colors.accentSoft}
        />
      ) : (
        <Card padded={false}>
          {members.map((member, index) => {
            const isSelf = member.user_id === currentUserId;
            const name = member.display_name + (isSelf ? " (you)" : "");
            const last = index === members.length - 1;

            return (
              <ListRow
                key={member.user_id}
                label={name}
                value={memberRoleLabel(member)}
                last={last}
                right={
                  member.is_creator ? (
                    <Badge label="Admin" tone="accent" />
                  ) : updatingUserId === member.user_id ? (
                    <ActivityIndicator size="small" color={colors.accentSoft} />
                  ) : (
                    <Switch
                      value={member.can_manage_allowlist}
                      onValueChange={(enabled) => handleToggle(member, enabled)}
                      trackColor={{ false: colors.border, true: colors.accent }}
                      thumbColor="#fff"
                      accessibilityLabel={`Let ${member.display_name} edit tracked work`}
                    />
                  )
                }
              />
            );
          })}
        </Card>
      )}
      <Text style={styles.footer}>
        Admins can let other members add or remove tracked apps and websites.
      </Text>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.xxl,
  },
  loader: {
    marginVertical: spacing.lg,
  },
  footer: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.md,
  },
});
