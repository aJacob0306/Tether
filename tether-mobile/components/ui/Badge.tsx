import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../constants/theme";

type IoniconName = keyof typeof Ionicons.glyphMap;

type BadgeProps = {
  label: string;
  tone?: "neutral" | "accent" | "success";
  icon?: IoniconName;
};

/** Small inline metadata chip (e.g. member count, invite code). */
export function Badge({ label, tone = "neutral", icon }: BadgeProps) {
  const toneColor =
    tone === "success"
      ? colors.workingSoft
      : tone === "accent"
        ? colors.accentSoft
        : colors.textSecondary;

  return (
    <View
      style={[
        styles.badge,
        tone === "success" && styles.success,
        tone === "accent" && styles.accent,
      ]}
    >
      {icon ? <Ionicons name={icon} size={11} color={toneColor} /> : null}
      <Text style={[styles.label, { color: toneColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  success: {
    borderColor: colors.workingBorder,
    backgroundColor: colors.workingSurface,
  },
  accent: {
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSurface,
  },
  label: {
    ...typography.overline,
  },
});
