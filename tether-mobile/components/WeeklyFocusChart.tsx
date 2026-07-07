import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../constants/theme";
import { formatFocusDurationFromMs, getLiveDailyFocusMs } from "../lib/status";
import type { MemberActivity, WeeklyWorkDay } from "../lib/supabase";

type WeeklyFocusChartProps = {
  weekDays: WeeklyWorkDay[];
  members: MemberActivity[];
  dayStart: Date;
  onDayPress?: (dayStart: Date) => void;
};

const BAR_MAX_HEIGHT = 96;

function formatHours(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours < 0.1) return "0h";
  if (hours < 10) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours)}h`;
}

export function WeeklyFocusChart({
  weekDays,
  members,
  dayStart,
  onDayPress,
}: WeeklyFocusChartProps) {
  const [, setTick] = useState(0);
  const workingMembers = members.filter(
    (member) => member.openSession && member.status === "working",
  );
  const hasWorkingMembers = workingMembers.length > 0;

  useEffect(() => {
    if (!hasWorkingMembers) return;

    const interval = setInterval(() => {
      setTick((tick) => tick + 1);
    }, 30_000);

    return () => clearInterval(interval);
  }, [hasWorkingMembers]);

  const currentDayKey = dayStart.toISOString();
  const liveDailyFocusMs = getLiveDailyFocusMs(workingMembers, dayStart);
  const displayDays = useMemo(
    () =>
      weekDays.map((day) => ({
        ...day,
        workMs: day.workMs + (day.key === currentDayKey ? liveDailyFocusMs : 0),
      })),
    [currentDayKey, liveDailyFocusMs, weekDays],
  );
  const totalWeekMs = displayDays.reduce((total, day) => total + day.workMs, 0);
  const maxWorkMs = Math.max(...displayDays.map((day) => day.workMs), 60 * 60 * 1000);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.overline}>THIS WEEK</Text>
          <Text style={styles.title}>Group focus</Text>
        </View>
        <Text style={styles.total}>{formatFocusDurationFromMs(totalWeekMs)}</Text>
      </View>

      <View style={styles.bars}>
        {displayDays.map((day) => {
          const isToday = day.key === currentDayKey;
          const barHeight =
            day.workMs > 0
              ? Math.max(4, Math.round((day.workMs / maxWorkMs) * BAR_MAX_HEIGHT))
              : 0;

          return (
            <Pressable
              key={day.key}
              style={({ pressed }) => [styles.barColumn, pressed && styles.barColumnPressed]}
              onPress={() => onDayPress?.(day.dayStart)}
              accessibilityRole="button"
              accessibilityLabel={`${day.label}, ${formatHours(day.workMs)} of focus`}
              accessibilityHint="View this day's activity log"
            >
              <Text style={styles.hourLabel}>{formatHours(day.workMs)}</Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    isToday && styles.barFillToday,
                    { height: barHeight },
                  ]}
                />
              </View>
              <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>
                {day.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  overline: {
    ...typography.overline,
    color: colors.textTertiary,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  total: {
    ...typography.heading,
    color: colors.accentSoft,
  },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  barColumn: {
    flex: 1,
    alignItems: "center",
  },
  barColumnPressed: {
    opacity: 0.7,
  },
  hourLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  barTrack: {
    width: "100%",
    height: BAR_MAX_HEIGHT,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  barFill: {
    width: "100%",
    borderRadius: radius.pill,
    backgroundColor: colors.accentMuted,
  },
  barFillToday: {
    backgroundColor: colors.accent,
  },
  dayLabel: {
    ...typography.overline,
    color: colors.textTertiary,
    textTransform: "uppercase",
    marginTop: spacing.sm,
  },
  dayLabelToday: {
    color: colors.accentSoft,
  },
});
