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

function displayTarget(member: MemberActivity): { label: string; preposition: string } | null {
  if (member.openSession?.target_type === "app") {
    return {
      label:
        member.openSession.target_display_name ??
        member.openSession.target_value ??
        member.openSession.title,
      preposition: "in",
    };
  }

  if (member.activeTab?.url) {
    try {
      return {
        label: new URL(member.activeTab.url).hostname,
        preposition: "on",
      };
    } catch {
      // fall through to session domain
    }
  }

  return member.openSession?.domain
    ? { label: member.openSession.domain, preposition: "on" }
    : null;
}

function latestTimestamp(...timestamps: Array<string | null | undefined>): string | null {
  return timestamps
    .filter((timestamp): timestamp is string => Boolean(timestamp))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
}

export function MemberCard({ member }: MemberCardProps) {
  const target = displayTarget(member);
  const statusText = target
    ? `${statusLabel(member.status)} ${target.preposition} ${target.label}`
    : statusLabel(member.status);

  const tabTitle =
    member.status === "offline" && !member.activeTab && !member.openSession
      ? "Not synced"
      : member.openSession?.target_type === "app"
        ? member.openSession.target_display_name ??
          member.openSession.target_value ??
          member.openSession.title
        : member.activeTab?.title || member.openSession?.title || "Untitled tab";
  const updatedAt = latestTimestamp(member.activeTab?.updated_at, member.openSession?.updated_at);

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
