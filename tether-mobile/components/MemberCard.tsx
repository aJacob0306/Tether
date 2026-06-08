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

function displayDomain(member: MemberActivity): string | null {
  if (member.activeTab?.url) {
    try {
      return new URL(member.activeTab.url).hostname;
    } catch {
      // fall through to session domain
    }
  }

  return member.openSession?.domain ?? null;
}

export function MemberCard({ member }: MemberCardProps) {
  const domain = displayDomain(member);
  const statusText = domain
    ? `${statusLabel(member.status)} on ${domain}`
    : statusLabel(member.status);

  const tabTitle =
    member.status === "offline" && !member.activeTab && !member.openSession
      ? "Not synced"
      : member.activeTab?.title || member.openSession?.title || "Untitled tab";
  const updatedAt = member.activeTab?.updated_at ?? member.openSession?.updated_at;

  return (
    <View style={appStyles.memberCard}>
      <View style={appStyles.memberHeader}>
        <View style={[appStyles.statusDot, statusDotStyle(member.status)]} />
        <Text style={appStyles.memberName}>{member.display_name}</Text>
        <Text style={appStyles.memberStatus}>{statusText}</Text>
      </View>
      <Text style={appStyles.memberTabTitle}>{tabTitle}</Text>
      <Text style={appStyles.memberMeta}>
        {updatedAt ? `Updated ${formatRelativeTime(updatedAt)}` : "No activity synced"}
      </Text>
    </View>
  );
}
