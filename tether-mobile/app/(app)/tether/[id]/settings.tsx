import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { AllowlistPanel } from "../../../../components/AllowlistPanel";
import { MemberPermissionsPanel } from "../../../../components/MemberPermissionsPanel";
import { SettingsRow, SettingsSection } from "../../../../components/SettingsSection";
import {
  AppScreen,
  Card,
  ErrorState,
  LoadingState,
  ListRow,
  ScreenHeader,
} from "../../../../components/ui";
import { useAuth } from "../../../../contexts/AuthContext";
import { colors, spacing, typography } from "../../../../constants/theme";
import {
  canManageAllowlist,
  fetchTetherMembers,
  memberRoleLabel,
  type TetherMemberWithRole,
} from "../../../../lib/members";
import { fetchTether } from "../../../../lib/tethers";
import type { Tether } from "../../../../lib/supabase";

export default function TetherSettingsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tether, setTether] = useState<Tether | null>(null);
  const [members, setMembers] = useState<TetherMemberWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const userId = session?.user.id;
  const isCreator = Boolean(tether && userId && tether.created_by === userId);
  const canManage = tether && userId ? canManageAllowlist(tether, userId, members) : false;
  const myMember = members.find((member) => member.user_id === userId);

  const loadSettings = useCallback(async () => {
    if (!id) return;

    setError("");
    try {
      const [tetherData, memberRows] = await Promise.all([
        fetchTether(id),
        fetchTetherMembers(id),
      ]);
      setTether(tetherData);
      setMembers(memberRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    loadSettings();
  }, [loadSettings]);

  async function handleCopyInviteCode() {
    if (!tether?.invite_code) return;
    await Clipboard.setStringAsync(tether.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <AppScreen>
      <ScreenHeader title="Tether settings" onBack={() => router.back()} />

      {loading ? (
        <LoadingState message="Loading settings…" />
      ) : error ? (
        <ErrorState message={error} onRetry={loadSettings} />
      ) : tether ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>{tether.name}</Text>
          <Text style={styles.subtitle}>
            {isCreator
              ? "You created this tether. Manage what counts as work and who can edit the rules."
              : canManage
                ? "You can add or remove the apps and websites that count as work here."
                : "These are the rules for this tether. Only admins and delegated managers can edit them."}
          </Text>

          <SettingsSection title="Workspace">
            <SettingsRow label="Name" value={tether.name} />
            <SettingsRow
              label="Invite code"
              value={tether.invite_code}
              hint="Share this code so others can join"
              last
            />
          </SettingsSection>

          <Card padded={false} style={styles.copyCard}>
            <ListRow
              icon={copied ? "checkmark" : "copy-outline"}
              label={copied ? "Copied to clipboard" : "Copy invite code"}
              onPress={handleCopyInviteCode}
              showChevron={false}
              last
            />
          </Card>

          <SettingsSection title="Your role">
            <SettingsRow
              label={myMember?.display_name ?? "You"}
              value={myMember ? memberRoleLabel(myMember) : "Member"}
              hint={
                isCreator
                  ? "Full admin access"
                  : canManage
                    ? "Can edit the work allowlist"
                    : "View-only access to rules"
              }
              last
            />
          </SettingsSection>

          {isCreator ? (
            <MemberPermissionsPanel tetherId={tether.id} currentUserId={userId ?? ""} />
          ) : null}

          <AllowlistPanel tetherId={tether.id} canManageAllowlist={canManage} />
        </ScrollView>
      ) : (
        <ErrorState
          title="Tether not found"
          message="This tether may have been removed or you no longer have access."
        />
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.subhead,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  copyCard: {
    marginBottom: spacing.xxl,
  },
});
