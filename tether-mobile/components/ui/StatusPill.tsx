import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../constants/theme";
import type { WorkStatus } from "../../lib/supabase";

type IoniconName = keyof typeof Ionicons.glyphMap;

type StatusConfig = {
  label: string;
  icon: IoniconName;
  color: string;
};

const STATUS_CONFIG: Record<WorkStatus, StatusConfig> = {
  working: { label: "Working", icon: "ellipse", color: colors.workingSoft },
  idle: { label: "Idle", icon: "time-outline", color: colors.idleSoft },
  offline: { label: "Offline", icon: "ellipse-outline", color: colors.offline },
};

type StatusPillProps = {
  status: WorkStatus;
  size?: "sm" | "md";
};

/**
 * Communicates work status with an icon, text label, AND color — never color
 * alone — so it stays readable for color-blind users and screen readers.
 */
export function StatusPill({ status, size = "md" }: StatusPillProps) {
  const config = STATUS_CONFIG[status];

  return (
    <View
      style={[styles.pill, size === "sm" && styles.pillSm]}
      accessibilityRole="text"
      accessibilityLabel={`Status: ${config.label}`}
    >
      <Ionicons
        name={config.icon}
        size={size === "sm" ? 9 : 11}
        color={config.color}
      />
      <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillSm: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  label: {
    ...typography.overline,
    textTransform: "uppercase",
  },
});
