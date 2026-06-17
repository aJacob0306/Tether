import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { appStyles } from "../constants/styles";
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

  return (
    <View style={appStyles.logDayNav}>
      <View style={appStyles.logDayNavRow}>
        <Pressable
          onPress={onPrevious}
          disabled={!canGoPrevious}
          style={[appStyles.logDayNavButton, !canGoPrevious && appStyles.logDayNavButtonDisabled]}
        >
          <Text style={appStyles.cardChevron}>{"<"}</Text>
        </Pressable>

        <View style={appStyles.logDayNavCenter}>
          <Text style={appStyles.logDayNavLabel}>{formatLogDayLabel(dayStart, isToday)}</Text>
          {loading ? (
            <ActivityIndicator size="small" color="#e6b4ff" style={{ marginTop: 6 }} />
          ) : (
            <Text style={appStyles.logDayNavTotal}>
              {formatFocusDurationFromMs(displayWorkMs)} group focus
            </Text>
          )}
        </View>

        <Pressable
          onPress={onNext}
          disabled={!canGoNext}
          style={[appStyles.logDayNavButton, !canGoNext && appStyles.logDayNavButtonDisabled]}
        >
          <Text style={appStyles.cardChevron}>{">"}</Text>
        </Pressable>
      </View>
    </View>
  );
}
