import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { appStyles } from "../constants/styles";
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
    <View style={appStyles.weeklyChartCard}>
      <View style={appStyles.weeklyChartHeader}>
        <View>
          <Text style={appStyles.metricLabel}>This Week</Text>
          <Text style={appStyles.tetherCardTitle}>Weekly hours</Text>
        </View>
        <Text style={appStyles.weeklyChartTotal}>{formatFocusDurationFromMs(totalWeekMs)}</Text>
      </View>

      <View style={appStyles.weeklyChartBars}>
        {displayDays.map((day) => {
          const barHeight =
            day.workMs > 0 ? Math.max(4, Math.round((day.workMs / maxWorkMs) * BAR_MAX_HEIGHT)) : 0;

          return (
            <Pressable
              key={day.key}
              style={({ pressed }) => [
                appStyles.weeklyChartBarColumn,
                pressed && appStyles.weeklyChartBarColumnPressed,
              ]}
              onPress={() => onDayPress?.(day.dayStart)}
              accessibilityRole="button"
              accessibilityLabel={`View log for ${day.label}, ${formatHours(day.workMs)}`}
            >
              <Text style={appStyles.weeklyChartHourLabel}>{formatHours(day.workMs)}</Text>
              <View style={appStyles.weeklyChartBarTrack}>
                <View
                  style={[
                    appStyles.weeklyChartBarFill,
                    day.key === currentDayKey ? appStyles.weeklyChartBarFillToday : null,
                    { height: barHeight },
                  ]}
                />
              </View>
              <Text
                style={[
                  appStyles.weeklyChartDayLabel,
                  day.key === currentDayKey ? appStyles.weeklyChartDayLabelToday : null,
                ]}
              >
                {day.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
