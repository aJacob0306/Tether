import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../constants/theme";
import { formatFocusDurationFromMs, getLiveDailyFocusMs } from "../lib/status";
import type { MemberActivity } from "../lib/supabase";

type GroupFocusTimerProps = {
  members: MemberActivity[];
  dailyWorkMs: number;
  dayStart: Date;
};

/**
 * Group momentum hero: today's combined focus time plus a live "working now"
 * indicator. Status uses an icon + text + color (never color alone).
 */
export function GroupFocusTimer({ members, dailyWorkMs, dayStart }: GroupFocusTimerProps) {
  const [, setFocusTick] = useState(0);
  const workingMembers = members.filter(
    (member) => member.openSession && member.status === "working",
  );
  const hasWorkingSessions = workingMembers.length > 0;

  useEffect(() => {
    if (!hasWorkingSessions) return;
    const interval = setInterval(() => setFocusTick((tick) => tick + 1), 30_000);
    return () => clearInterval(interval);
  }, [hasWorkingSessions]);

  const totalFocus = formatFocusDurationFromMs(
    dailyWorkMs + getLiveDailyFocusMs(workingMembers, dayStart),
  );
  const workingCount = workingMembers.length;

  const workingLabel =
    workingCount === 0
      ? "Nobody working right now"
      : workingCount === 1
        ? "1 person working now"
        : `${workingCount} people working now`;

  return (
    <View
      style={styles.card}
      accessibilityLabel={`Today's group focus ${totalFocus}. ${workingLabel}.`}
    >
      <Text style={styles.overline}>TODAY&apos;S MOMENTUM</Text>
      <Text style={styles.value}>{totalFocus}</Text>
      <Text style={styles.caption}>Combined focus time today</Text>

      <View style={styles.divider} />

      <View style={styles.workingRow}>
        <Ionicons
          name={workingCount > 0 ? "ellipse" : "ellipse-outline"}
          size={10}
          color={workingCount > 0 ? colors.workingSoft : colors.offline}
        />
        <Text
          style={[
            styles.workingText,
            { color: workingCount > 0 ? colors.workingSoft : colors.textSecondary },
          ]}
        >
          {workingLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
  },
  overline: {
    ...typography.overline,
    color: colors.textTertiary,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  value: {
    fontSize: 40,
    fontWeight: "700",
    color: colors.textPrimary,
    lineHeight: 46,
  },
  caption: {
    ...typography.subhead,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  workingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  workingText: {
    ...typography.label,
  },
});
