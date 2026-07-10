import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WeeklyFocusChart } from "../../../components/WeeklyFocusChart";
import {
  AppScreen,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  SectionHeader,
  StatSummaryCard,
} from "../../../components/ui";
import { colors, radius, spacing, typography } from "../../../constants/theme";
import { usePersonalLog } from "../../../hooks/usePersonalLog";
import { formatFocusDurationFromMs } from "../../../lib/status";

export default function PersonalLogScreen() {
  const router = useRouter();
  const { log, loading, refreshing, error, localDayStart, refresh } = usePersonalLog();

  return (
    <AppScreen edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Personal log</Text>
          <Text style={styles.subtitle}>Your focus across all tethers</Text>
        </View>
        <IconButton
          icon="person-circle-outline"
          onPress={() => router.push("/settings")}
          accessibilityLabel="Profile and settings"
          size={24}
        />
      </View>

      {loading ? (
        <LoadingState message="Loading your log…" />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.accentSoft}
            />
          }
        >
          <View style={styles.statRow}>
            <StatSummaryCard
              icon="time-outline"
              label="Lifetime"
              value={formatFocusDurationFromMs(log.lifetimeWorkMs)}
            />
            <StatSummaryCard
              icon="sunny-outline"
              label="Today"
              value={formatFocusDurationFromMs(log.todayWorkMs)}
            />
          </View>

          <View style={styles.statRow}>
            <StatSummaryCard
              icon="flame-outline"
              label="Streak"
              value={log.streakDays === 1 ? "1 day" : `${log.streakDays} days`}
              caption="Consecutive days with tracked work"
            />
          </View>

          <WeeklyFocusChart
            weekDays={log.weeklyWorkDays}
            dayStart={localDayStart}
            overline="THIS WEEK"
            title="Your focus"
          />

          <SectionHeader title="Most used" count={log.topTargets.length || undefined} />
          {log.topTargets.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No tracked tools yet</Text>
              <Text style={styles.emptyText}>
                Time on allowlisted apps and sites will show up here.
              </Text>
            </Card>
          ) : (
            <Card padded={false} style={styles.listCard}>
              {log.topTargets.map((target, index) => (
                <View
                  key={`${target.targetType ?? "domain"}:${target.domain}`}
                  style={[
                    styles.toolRow,
                    index === log.topTargets.length - 1 && styles.toolRowLast,
                  ]}
                >
                  <View style={styles.toolIcon}>
                    <Ionicons
                      name={target.targetType === "app" ? "laptop-outline" : "globe-outline"}
                      size={16}
                      color={colors.accentSoft}
                    />
                  </View>
                  <Text style={styles.toolName} numberOfLines={1}>
                    {target.domain}
                  </Text>
                  <Text style={styles.toolTime}>
                    {formatFocusDurationFromMs(target.workMs)}
                  </Text>
                </View>
              ))}
            </Card>
          )}

          <SectionHeader
            title="By tether"
            count={log.tetherTotals.length || undefined}
          />
          {log.tetherTotals.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="No tethers yet"
              message="Join or create a tether to see how your work breaks down by group."
              actionLabel="Go to Home"
              onAction={() => router.push("/")}
            />
          ) : (
            <Card padded={false} style={styles.listCard}>
              {log.tetherTotals.map((tether, index) => (
                <Pressable
                  key={tether.tetherId}
                  onPress={() => router.push(`/tether/${tether.tetherId}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${tether.tetherName}, ${formatFocusDurationFromMs(tether.workMs)}`}
                  style={({ pressed }) => [
                    styles.tetherRow,
                    index === log.tetherTotals.length - 1 && styles.toolRowLast,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.toolIcon}>
                    <Ionicons name="link-outline" size={16} color={colors.accentSoft} />
                  </View>
                  <Text style={styles.toolName} numberOfLines={1}>
                    {tether.tetherName}
                  </Text>
                  <Text style={styles.toolTime}>
                    {formatFocusDurationFromMs(tether.workMs)}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={colors.textTertiary}
                  />
                </Pressable>
              ))}
            </Card>
          )}
        </ScrollView>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
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
  listCard: {
    marginBottom: spacing.xl,
    overflow: "hidden",
  },
  emptyCard: {
    marginBottom: spacing.xl,
    gap: spacing.xs,
  },
  emptyTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  emptyText: {
    ...typography.subhead,
    color: colors.textSecondary,
  },
  toolRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tetherRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  toolRowLast: {
    borderBottomWidth: 0,
  },
  pressed: {
    opacity: 0.75,
  },
  toolIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toolName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flex: 1,
  },
  toolTime: {
    ...typography.label,
    color: colors.textSecondary,
  },
});
