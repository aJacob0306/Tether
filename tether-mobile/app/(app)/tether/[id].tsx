import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { DetailedLog } from "../../../components/DetailedLog";
import { GroupFocusTimer } from "../../../components/GroupFocusTimer";
import { LogDayNavigator } from "../../../components/LogDayNavigator";
import { MemberCard } from "../../../components/MemberCard";
import { WeeklyFocusChart } from "../../../components/WeeklyFocusChart";
import {
  AppScreen,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  ScreenHeader,
  SectionHeader,
  StatSummaryCard,
} from "../../../components/ui";
import { colors, radius, spacing, typography } from "../../../constants/theme";
import { useDeviceStatus } from "../../../hooks/useDeviceStatus";
import { useTetherBoard } from "../../../hooks/useTetherBoard";
import {
  formatFocusDurationFromMs,
  getLiveDailyFocusMs,
  isSameLocalDay,
} from "../../../lib/status";
import type { MemberActivity, WorkStatus } from "../../../lib/supabase";

type TetherTab = "board" | "log";

const STATUS_ORDER: Record<WorkStatus, number> = {
  working: 0,
  idle: 1,
  offline: 2,
};

export default function TetherBoardScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    tether,
    members,
    loading,
    refreshing,
    error,
    dailyWorkMs,
    lifetimeWorkMs,
    weeklyWorkDays,
    logMemberLogs,
    logDayWindow,
    logDayLoading,
    localDayWindow,
    refresh,
    selectLogDay,
    shiftLogDay,
    canGoPreviousLogDay,
    canGoNextLogDay,
  } = useTetherBoard(id);
  const { status: deviceStatus, loading: deviceStatusLoading } = useDeviceStatus();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<TetherTab>("board");

  const workingMembers = members.filter((member) => member.status === "working");
  const liveDailyFocusMs = getLiveDailyFocusMs(workingMembers, localDayWindow.dayStart);
  const lifetimeFocusMs = lifetimeWorkMs + liveDailyFocusMs;
  const showDesktopSetupCard =
    !deviceStatusLoading && !deviceStatus?.hasRecentDesktop;

  const { working, quiet } = useMemo(() => {
    const sorted = [...members].sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        a.display_name.localeCompare(b.display_name),
    );
    return {
      working: sorted.filter((member) => member.status === "working"),
      quiet: sorted.filter((member) => member.status !== "working"),
    };
  }, [members]);

  async function handleCopyInviteCode() {
    if (!tether?.invite_code) return;
    await Clipboard.setStringAsync(tether.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <AppScreen>
      <ScreenHeader
        title={tether?.name ?? "Tether"}
        onBack={() => router.back()}
        right={
          <>
            <IconButton
              icon={copied ? "checkmark" : "copy-outline"}
              onPress={handleCopyInviteCode}
              accessibilityLabel={copied ? "Invite code copied" : "Copy invite code"}
            />
            <IconButton
              icon="settings-outline"
              onPress={() => router.push(`/tether/${id}/settings`)}
              accessibilityLabel="Tether settings"
            />
          </>
        }
      />

      {loading ? (
        <LoadingState message="Loading tether…" />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : tether ? (
        <>
          <View style={styles.segment} accessibilityRole="tablist">
            {(["board", "log"] as const).map((tab) => {
              const selected = activeTab === tab;
              return (
                <Pressable
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={tab === "board" ? "Board" : "Activity log"}
                  style={[styles.segmentButton, selected && styles.segmentButtonActive]}
                >
                  <Text
                    style={[
                      styles.segmentLabel,
                      selected && styles.segmentLabelActive,
                    ]}
                  >
                    {tab === "board" ? "Board" : "Log"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor={colors.accentSoft}
              />
            }
          >
            {activeTab === "board" ? (
              <>
                <GroupFocusTimer
                  members={members}
                  dailyWorkMs={dailyWorkMs}
                  dayStart={localDayWindow.dayStart}
                />

                {showDesktopSetupCard ? (
                  <Card
                    style={styles.desktopSetupCard}
                    onPress={() => router.push("/companion")}
                    accessibilityLabel="Connect desktop to verify your work"
                    accessibilityHint="Opens desktop companion setup"
                  >
                    <View style={styles.desktopSetupBody}>
                      <Text style={styles.desktopSetupTitle}>
                        Connect desktop to verify your work
                      </Text>
                      <Text style={styles.desktopSetupText}>
                        Desktop not connected. Open the companion on your computer so
                        Tether can detect approved project apps.
                      </Text>
                    </View>
                    <Ionicons
                      name="laptop-outline"
                      size={22}
                      color={colors.accentSoft}
                    />
                  </Card>
                ) : null}

                <View style={styles.statRow}>
                  <StatSummaryCard
                    icon="people-outline"
                    label="Members"
                    value={String(members.length)}
                  />
                  <StatSummaryCard
                    icon="time-outline"
                    label="Lifetime focus"
                    value={formatFocusDurationFromMs(lifetimeFocusMs)}
                  />
                </View>

                <WeeklyFocusChart
                  weekDays={weeklyWorkDays}
                  members={members}
                  dayStart={localDayWindow.dayStart}
                  onDayPress={(dayStart) => {
                    selectLogDay(dayStart);
                    setActiveTab("log");
                  }}
                />

                {members.length === 1 ? (
                  <View style={styles.inviteHint}>
                    <Badge label={`Invite code ${tether.invite_code}`} tone="accent" icon="key-outline" />
                    <Text style={styles.inviteHintText}>
                      Share this code so others can join and you can see each other working.
                    </Text>
                  </View>
                ) : null}

                {working.length > 0 ? (
                  <View style={styles.section}>
                    <SectionHeader title="Working now" count={working.length} />
                    <View style={styles.memberList}>
                      {working.map((member) => (
                        <MemberCard
                          key={member.user_id}
                          member={member}
                          onPress={() =>
                            router.push(`/tether/${id}/member/${member.user_id}`)
                          }
                        />
                      ))}
                    </View>
                  </View>
                ) : null}

                {quiet.length > 0 ? (
                  <View style={styles.section}>
                    <SectionHeader
                      title={working.length > 0 ? "Idle & offline" : "Members"}
                      count={quiet.length}
                    />
                    <View style={styles.memberList}>
                      {quiet.map((member) => (
                        <MemberCard
                          key={member.user_id}
                          member={member}
                          onPress={() =>
                            router.push(`/tether/${id}/member/${member.user_id}`)
                          }
                        />
                      ))}
                    </View>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <LogDayNavigator
                  dayStart={logDayWindow.dayStart}
                  weekDays={weeklyWorkDays}
                  members={members}
                  onPrevious={() => shiftLogDay(-1)}
                  onNext={() => shiftLogDay(1)}
                  canGoPrevious={canGoPreviousLogDay}
                  canGoNext={canGoNextLogDay}
                  loading={logDayLoading}
                />
                <DetailedLog
                  logs={logMemberLogs}
                  members={members}
                  dayStart={logDayWindow.dayStart}
                  isToday={isSameLocalDay(logDayWindow.dayStart, new Date())}
                />
              </>
            )}
          </ScrollView>
        </>
      ) : (
        <EmptyState
          icon="alert-circle-outline"
          title="Tether not found"
          message="This tether may have been removed or you no longer have access."
          actionLabel="Back to tethers"
          onAction={() => router.back()}
        />
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  segmentButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    minHeight: 40,
    borderRadius: radius.sm,
  },
  segmentButtonActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentLabel: {
    ...typography.label,
    color: colors.textSecondary,
  },
  segmentLabelActive: {
    color: colors.textPrimary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  statRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  desktopSetupCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.lg,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSurface,
  },
  desktopSetupBody: {
    flex: 1,
    gap: spacing.xs,
  },
  desktopSetupTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  desktopSetupText: {
    ...typography.subhead,
    color: colors.textSecondary,
  },
  inviteHint: {
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSurface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  inviteHintText: {
    ...typography.subhead,
    color: colors.textSecondary,
  },
  section: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  memberList: {
    gap: spacing.md,
  },
});
