import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../constants/theme";
import { Card, EmptyState } from "./ui";
import {
  formatFocusDurationFromMs,
  formatLogContributionLabel,
  getLiveDailyFocusMs,
} from "../lib/status";
import type { DailyMemberLog, DailyTopDomain, MemberActivity } from "../lib/supabase";

type DetailedLogProps = {
  logs: DailyMemberLog[];
  members: MemberActivity[];
  dayStart: Date;
  isToday: boolean;
};

function withLiveWork(
  log: DailyMemberLog,
  member: MemberActivity | undefined,
  dayStart: Date,
): DailyMemberLog {
  if (!member?.openSession || member.status !== "working") return log;

  const liveWorkMs = getLiveDailyFocusMs([member], dayStart);
  if (liveWorkMs <= 0) return log;

  const domainTotals = new Map<string, number>();
  const targetTypes = new Map<string, DailyTopDomain["targetType"]>();
  log.topDomains.forEach((domain) => {
    domainTotals.set(domain.domain, domain.workMs);
    targetTypes.set(domain.domain, domain.targetType);
  });

  const liveTargetLabel =
    member.openSession.target_type === "app"
      ? member.openSession.target_display_name ??
        member.openSession.target_value ??
        member.openSession.title
      : member.openSession.domain;

  domainTotals.set(
    liveTargetLabel,
    (domainTotals.get(liveTargetLabel) ?? 0) + liveWorkMs,
  );
  targetTypes.set(liveTargetLabel, member.openSession.target_type);

  const topDomains: DailyTopDomain[] = Array.from(domainTotals.entries())
    .map(([domain, workMs]) => ({ domain, workMs, targetType: targetTypes.get(domain) }))
    .sort((a, b) => b.workMs - a.workMs || a.domain.localeCompare(b.domain))
    .slice(0, 3);

  return {
    ...log,
    totalWorkMs: log.totalWorkMs + liveWorkMs,
    topDomains,
  };
}

export function DetailedLog({ logs, members, dayStart, isToday }: DetailedLogProps) {
  const [, setTick] = useState(0);
  const hasWorkingMembers =
    isToday && members.some((member) => member.openSession && member.status === "working");
  const contributionLabel = formatLogContributionLabel(dayStart, isToday);

  useEffect(() => {
    if (!hasWorkingMembers) return;

    const interval = setInterval(() => {
      setTick((tick) => tick + 1);
    }, 30_000);

    return () => clearInterval(interval);
  }, [hasWorkingMembers]);

  const membersById = new Map(members.map((member) => [member.user_id, member]));
  const displayLogs = isToday
    ? logs.map((log) => withLiveWork(log, membersById.get(log.user_id), dayStart))
    : logs;

  if (!displayLogs.length) {
    return (
      <EmptyState
        icon="moon-outline"
        title="No work logged"
        message={
          isToday
            ? "Nobody has worked on tracked tools yet today. Time on tracked apps and sites will show up here."
            : "Nobody worked on tracked tools this day."
        }
      />
    );
  }

  return (
    <View style={styles.list}>
      {displayLogs.map((item) => (
        <Card
          key={item.user_id}
          accessibilityLabel={`${item.display_name}, ${formatFocusDurationFromMs(item.totalWorkMs)} ${contributionLabel}`}
        >
          <View style={styles.header}>
            <Text style={styles.name} numberOfLines={1}>
              {item.display_name}
            </Text>
            <Text style={styles.total}>
              {formatFocusDurationFromMs(item.totalWorkMs)}
            </Text>
          </View>

          <Text style={styles.meta}>{contributionLabel}</Text>

          {item.topDomains.length > 0 ? (
            <View style={styles.domainList}>
              {item.topDomains.map((domain) => (
                <View key={domain.domain} style={styles.domainRow}>
                  <Ionicons
                    name={domain.targetType === "app" ? "laptop-outline" : "globe-outline"}
                    size={14}
                    color={colors.textTertiary}
                  />
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
            <Text style={styles.empty}>No work targets tracked this day.</Text>
          )}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: 2,
  },
  name: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flex: 1,
  },
  total: {
    ...typography.bodyStrong,
    color: colors.accentSoft,
  },
  meta: {
    ...typography.caption,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  domainList: {
    gap: 0,
  },
  domainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
  empty: {
    ...typography.subhead,
    color: colors.textSecondary,
  },
});
