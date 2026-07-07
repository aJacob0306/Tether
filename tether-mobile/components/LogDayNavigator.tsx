import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../constants/theme";
import { IconButton } from "./ui";
import {
  formatFocusDurationFromMs,
  formatLogDayLabel,
  getLiveDailyFocusMs,
  isSameLocalDay,
} from "../lib/status";
import type { MemberActivity, WeeklyWorkDay } from "../lib/supabase";

type LogDayNavigatorProps = {
  dayStart: Date;
  weekDays: WeeklyWorkDay[];
  members: MemberActivity[];
  onPrevious: () => void;
  onNext: () => void;
  canGoPrevious: boolean;
  canGoNext: boolean;
  loading: boolean;
};

export function LogDayNavigator({
  dayStart,
  weekDays,
  members,
  onPrevious,
  onNext,
  canGoPrevious,
  canGoNext,
  loading,
}: LogDayNavigatorProps) {
  const isToday = isSameLocalDay(dayStart, new Date());
  const dayKey = dayStart.toISOString();
  const storedWorkMs = weekDays.find((day) => day.key === dayKey)?.workMs ?? 0;
  const workingMembers = members.filter(
    (member) => member.openSession && member.status === "working",
  );
  const liveWorkMs = isToday ? getLiveDailyFocusMs(workingMembers, dayStart) : 0;
  const displayWorkMs = storedWorkMs + liveWorkMs;
  const dayLabel = formatLogDayLabel(dayStart, isToday);

  return (
    <View style={styles.card}>
      <IconButton
        icon="chevron-back"
        onPress={onPrevious}
        disabled={!canGoPrevious}
        accessibilityLabel="Previous day"
      />

      <View style={styles.center} accessibilityRole="header" accessibilityLabel={dayLabel}>
        <Text style={styles.dayLabel}>{dayLabel}</Text>
        {loading ? (
          <ActivityIndicator size="small" color={colors.accentSoft} style={styles.loader} />
        ) : (
          <Text style={styles.total}>
            {formatFocusDurationFromMs(displayWorkMs)} group focus
          </Text>
        )}
      </View>

      <IconButton
        icon="chevron-forward"
        onPress={onNext}
        disabled={!canGoNext}
        accessibilityLabel="Next day"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  center: {
    flex: 1,
    alignItems: "center",
  },
  dayLabel: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  total: {
    ...typography.label,
    color: colors.accentSoft,
    marginTop: spacing.xs,
  },
  loader: {
    marginTop: spacing.xs,
  },
});
