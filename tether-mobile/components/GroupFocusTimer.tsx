import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { appStyles } from "../constants/styles";
import { formatFocusDurationFromMs, getLiveDailyFocusMs } from "../lib/status";
import type { MemberActivity } from "../lib/supabase";

type GroupFocusTimerProps = {
  members: MemberActivity[];
  dailyWorkMs: number;
  dayStart: Date;
};

export function GroupFocusTimer({ members, dailyWorkMs, dayStart }: GroupFocusTimerProps) {
  const [, setFocusTick] = useState(0);
  const workingMembers = members.filter(
    (member) => member.openSession && member.status === "working",
  );
  const hasWorkingSessions = workingMembers.length > 0;

  useEffect(() => {
    if (!hasWorkingSessions) return;

    const interval = setInterval(() => {
      setFocusTick((tick) => tick + 1);
    }, 30_000);

    return () => clearInterval(interval);
  }, [hasWorkingSessions]);

  const totalFocus = formatFocusDurationFromMs(
    dailyWorkMs + getLiveDailyFocusMs(workingMembers, dayStart),
  );
  const workingCount = workingMembers.length;

  return (
    <View style={appStyles.groupFocusTimer}>
      <Text style={appStyles.groupFocusTimerValue}>{totalFocus}</Text>
      <Text style={appStyles.groupFocusTimerLabel}>
        {workingCount === 0
          ? "Today's group work time"
          : workingCount === 1
            ? "Today's group work time · 1 person working"
            : `Today's group work time · ${workingCount} people working`}
      </Text>
    </View>
  );
}
