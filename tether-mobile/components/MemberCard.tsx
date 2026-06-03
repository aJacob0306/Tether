import { Text, View } from "react-native";
import { appStyles } from "../constants/styles";
import { formatRelativeTime, statusLabel } from "../lib/status";
import type { MemberActivity, WorkStatus } from "../lib/supabase";

function statusDotStyle(status: WorkStatus) {
  switch (status) {
    case "working":
      return appStyles.statusWorking;
    case "idle":
      return appStyles.statusIdle;
    default:
      return appStyles.statusOffline;
  }
}

type MemberCardProps = {
  member: MemberActivity;
};

export function MemberCard({ member }: MemberCardProps) {
  const tabTitle =
    member.status === "offline" || !member.activeTab
      ? "Not synced"
      : member.activeTab.title || "Untitled tab";

  return (
    <View style={appStyles.memberCard}>
      <View style={appStyles.memberHeader}>
        <View style={[appStyles.statusDot, statusDotStyle(member.status)]} />
        <Text style={appStyles.memberName}>{member.display_name}</Text>
        <Text style={appStyles.memberStatus}>{statusLabel(member.status)}</Text>
      </View>
      <Text style={appStyles.memberTabTitle}>{tabTitle}</Text>
      <Text style={appStyles.memberMeta}>
        {member.activeTab
          ? `Updated ${formatRelativeTime(member.activeTab.updated_at)}`
          : "No activity synced"}
      </Text>
    </View>
  );
}
