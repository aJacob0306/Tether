import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../constants/theme";
import { StatusPill } from "./ui/StatusPill";
import { formatRelativeTime } from "../lib/status";
import type { MemberActivity } from "../lib/supabase";

type MemberCardProps = {
  member: MemberActivity;
  onPress?: () => void;
};

function displayTarget(
  member: MemberActivity,
): { label: string; icon: "laptop-outline" | "globe-outline" } | null {
  if (member.openSession?.target_type === "app") {
    return {
      label:
        member.openSession.target_display_name ??
        member.openSession.target_value ??
        member.openSession.title,
      icon: "laptop-outline",
    };
  }

  if (member.activeTab?.url) {
    try {
      return { label: new URL(member.activeTab.url).hostname, icon: "globe-outline" };
    } catch {
      // fall through to session domain
    }
  }

  return member.openSession?.domain
    ? { label: member.openSession.domain, icon: "globe-outline" }
    : null;
}

function latestTimestamp(...timestamps: Array<string | null | undefined>): string | null {
  return (
    timestamps
      .filter((timestamp): timestamp is string => Boolean(timestamp))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null
  );
}

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function MemberCard({ member, onPress }: MemberCardProps) {
  const target = displayTarget(member);
  const isWorking = member.status === "working";
  const updatedAt = latestTimestamp(
    member.activeTab?.updated_at,
    member.openSession?.updated_at,
  );

  const focusLine = target
    ? target.label
    : member.status === "offline"
      ? "Not synced"
      : "No tracked tool open";

  const accessibilityLabel = `${member.display_name}, ${member.status}${
    target ? `, ${target.label}` : ""
  }${updatedAt ? `, updated ${formatRelativeTime(updatedAt)}` : ""}`;

  const Container: typeof Pressable | typeof View = onPress ? Pressable : View;

  return (
    <Container
      {...(onPress
        ? {
            onPress,
            accessibilityRole: "button" as const,
            accessibilityLabel,
            accessibilityHint: "View member activity",
          }
        : { accessibilityLabel })}
      style={[styles.card, isWorking && styles.cardWorking]}
    >
      <View style={[styles.avatar, isWorking && styles.avatarWorking]}>
        <Text style={styles.avatarText}>{initial(member.display_name)}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={styles.name} numberOfLines={1}>
            {member.display_name}
          </Text>
          <StatusPill status={member.status} size="sm" />
        </View>

        <View style={styles.focusRow}>
          {target ? (
            <Ionicons name={target.icon} size={13} color={colors.textSecondary} />
          ) : null}
          <Text style={styles.focus} numberOfLines={1}>
            {focusLine}
          </Text>
        </View>

        <Text style={styles.meta}>
          {updatedAt ? `Updated ${formatRelativeTime(updatedAt)}` : "No activity synced"}
        </Text>
      </View>

      {onPress ? (
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      ) : null}
    </Container>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
  },
  cardWorking: {
    borderColor: colors.workingBorder,
    backgroundColor: colors.surface,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarWorking: {
    borderColor: colors.workingBorder,
    backgroundColor: colors.workingSurface,
  },
  avatarText: {
    ...typography.bodyStrong,
    color: colors.accentSoft,
  },
  body: {
    flex: 1,
    gap: 3,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  name: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flex: 1,
  },
  focusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  focus: {
    ...typography.subhead,
    color: colors.textSecondary,
    flex: 1,
  },
  meta: {
    ...typography.caption,
    color: colors.textTertiary,
  },
});
