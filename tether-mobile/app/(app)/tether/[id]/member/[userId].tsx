import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  AppScreen,
  Card,
  EmptyState,
  LoadingState,
  ScreenHeader,
  SectionHeader,
  StatusPill,
} from "../../../../../components/ui";
import { colors, radius, spacing, typography } from "../../../../../constants/theme";
import { useTetherBoard } from "../../../../../hooks/useTetherBoard";
import {
  formatFocusDurationFromMs,
  formatRelativeTime,
  getLiveDailyFocusMs,
} from "../../../../../lib/status";
import type { MemberActivity } from "../../../../../lib/supabase";

function currentTool(member: MemberActivity): { label: string; icon: "laptop-outline" | "globe-outline" } | null {
  if (member.openSession?.target_type === "app") {
    return {
      label:
        member.openSession.target_display_name ??
        member.openSession.target_value ??
        member.openSession.title,
      icon: "laptop-outline",
    };
  }
  if (member.activeTab?.url) {
    try {
      return { label: new URL(member.activeTab.url).hostname, icon: "globe-outline" };
    } catch {
      // ignore
    }
  }
  return member.openSession?.domain
    ? { label: member.openSession.domain, icon: "globe-outline" }
    : null;
}

export default function MemberDetailScreen() {
  const router = useRouter();
  const { id, userId } = useLocalSearchParams<{ id: string; userId: string }>();
  const { members, logMemberLogs, localDayWindow, loading } = useTetherBoard(id);

  const member = members.find((m) => m.user_id === userId);
  const log = logMemberLogs.find((l) => l.user_id === userId);

  const liveMs =
    member && member.status === "working"
      ? getLiveDailyFocusMs([member], localDayWindow.dayStart)
      : 0;
  const todayMs = (log?.totalWorkMs ?? 0) + liveMs;

  const tool = member ? currentTool(member) : null;
  const updatedAt =
    member?.openSession?.updated_at ?? member?.activeTab?.updated_at ?? null;

  return (
    <AppScreen>
      <ScreenHeader title="Member activity" onBack={() => router.back()} />

      {loading && !member ? (
        <LoadingState message="Loading activity…" />
      ) : !member ? (
        <EmptyState
          icon="person-outline"
          title="Member not found"
          message="This member may have left the tether."
          actionLabel="Back to board"
          onAction={() => router.back()}
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {member.display_name.trim().charAt(0).toUpperCase() || "?"}
              </Text>
            </View>
            <Text style={styles.name}>{member.display_name}</Text>
            <StatusPill status={member.status} />
          </View>

          <SectionHeader title="Right now" />
          <Card style={styles.card}>
            {tool ? (
              <View style={styles.toolRow}>
                <Ionicons name={tool.icon} size={18} color={colors.accentSoft} />
                <Text style={styles.toolLabel}>{tool.label}</Text>
              </View>
            ) : (
              <Text style={styles.muted}>
                {member.status === "offline"
                  ? "Not currently synced."
                  : "No tracked tool open right now."}
              </Text>
            )}
            <Text style={styles.meta}>
              {updatedAt ? `Updated ${formatRelativeTime(updatedAt)}` : "No activity synced"}
            </Text>
          </Card>

          <View style={styles.sectionGap}>
            <SectionHeader title="Today" />
            <Card style={styles.card}>
              <Text style={styles.totalValue}>{formatFocusDurationFromMs(todayMs)}</Text>
              <Text style={styles.totalLabel}>Focused on tracked tools today</Text>

              {log && log.topDomains.length > 0 ? (
                <View style={styles.domainList}>
                  {log.topDomains.map((domain, index) => (
                    <View key={domain.domain} style={styles.domainRow}>
                      <Text style={styles.domainRank}>{index + 1}</Text>
                      <Text style={styles.domainName} numberOfLines={1}>
                        {domain.domain}
                      </Text>
                      <Text style={styles.domainTime}>
                        {formatFocusDurationFromMs(domain.workMs)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.mutedSpaced}>
                  No tracked work logged today yet.
                </Text>
              )}
            </Card>
          </View>
        </ScrollView>
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
  hero: {
    alignItems: "center",
    marginBottom: spacing.xxl,
    gap: spacing.md,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 36,
    fontWeight: "700",
    color: colors.accentSoft,
  },
  name: {
    ...typography.title,
    color: colors.textPrimary,
  },
  card: {
    gap: spacing.sm,
  },
  toolRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  toolLabel: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flex: 1,
  },
  muted: {
    ...typography.subhead,
    color: colors.textSecondary,
  },
  mutedSpaced: {
    ...typography.subhead,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  meta: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  sectionGap: {
    marginTop: spacing.xl,
  },
  totalValue: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  totalLabel: {
    ...typography.subhead,
    color: colors.textSecondary,
  },
  domainList: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  domainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  domainRank: {
    ...typography.caption,
    color: colors.textTertiary,
    width: 16,
  },
  domainName: {
    ...typography.subhead,
    color: colors.textPrimary,
    flex: 1,
  },
  domainTime: {
    ...typography.label,
    color: colors.textSecondary,
  },
});
