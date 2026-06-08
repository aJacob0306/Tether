import { useEffect, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { appStyles } from "../constants/styles";
import { formatFocusDurationFromMs, getLiveDailyFocusMs } from "../lib/status";
import type { DailyMemberLog, DailyTopDomain, MemberActivity } from "../lib/supabase";

type DetailedLogProps = {
  logs: DailyMemberLog[];
  members: MemberActivity[];
  dayStart: Date;
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
  log.topDomains.forEach((domain) => {
    domainTotals.set(domain.domain, domain.workMs);
  });

  domainTotals.set(
    member.openSession.domain,
    (domainTotals.get(member.openSession.domain) ?? 0) + liveWorkMs,
  );

  const topDomains: DailyTopDomain[] = Array.from(domainTotals.entries())
    .map(([domain, workMs]) => ({ domain, workMs }))
    .sort((a, b) => b.workMs - a.workMs || a.domain.localeCompare(b.domain))
    .slice(0, 3);

  return {
    ...log,
    totalWorkMs: log.totalWorkMs + liveWorkMs,
    topDomains,
  };
}

export function DetailedLog({ logs, members, dayStart }: DetailedLogProps) {
  const [, setTick] = useState(0);
  const hasWorkingMembers = members.some(
    (member) => member.openSession && member.status === "working",
  );

  useEffect(() => {
    if (!hasWorkingMembers) return;

    const interval = setInterval(() => {
      setTick((tick) => tick + 1);
    }, 30_000);

    return () => clearInterval(interval);
  }, [hasWorkingMembers]);

  const membersById = new Map(members.map((member) => [member.user_id, member]));
  const displayLogs = logs.map((log) => withLiveWork(log, membersById.get(log.user_id), dayStart));

  return (
    <FlatList
      style={appStyles.detailLogList}
      contentContainerStyle={appStyles.detailLogContent}
      data={displayLogs}
      keyExtractor={(item) => item.user_id}
      ListEmptyComponent={
        <Text style={appStyles.emptyState}>No work logged for this tether today.</Text>
      }
      renderItem={({ item }) => (
        <View style={appStyles.detailLogCard}>
          <View style={appStyles.detailLogHeader}>
            <Text style={appStyles.detailLogName}>{item.display_name}</Text>
            <Text style={appStyles.detailLogTotal}>
              {formatFocusDurationFromMs(item.totalWorkMs)}
            </Text>
          </View>

          <Text style={appStyles.detailLogMeta}>Today's contribution</Text>

          {item.topDomains.length > 0 ? (
            item.topDomains.map((domain, index) => (
              <View key={domain.domain} style={appStyles.detailDomainRow}>
                <Text style={appStyles.detailDomainRank}>{index + 1}</Text>
                <Text style={appStyles.detailDomainName}>{domain.domain}</Text>
                <Text style={appStyles.detailDomainTime}>
                  {formatFocusDurationFromMs(domain.workMs)}
                </Text>
              </View>
            ))
          ) : (
            <Text style={appStyles.detailLogEmpty}>No domains tracked today.</Text>
          )}
        </View>
      )}
    />
  );
}
