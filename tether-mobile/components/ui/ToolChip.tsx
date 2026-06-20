import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../constants/theme";

type ToolChipProps = {
  label: string;
  iconUri?: string | null;
  /** When provided, shows a remove (x) affordance. */
  onRemove?: () => void;
};

/** Compact chip representing a selected app/website. */
export function ToolChip({ label, iconUri, onRemove }: ToolChipProps) {
  return (
    <View style={styles.chip}>
      {iconUri ? (
        <Image source={{ uri: iconUri }} style={styles.icon} />
      ) : (
        <View style={styles.iconFallback}>
          <Text style={styles.iconFallbackText}>
            {label.trim().charAt(0).toUpperCase() || "?"}
          </Text>
        </View>
      )}
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          hitSlop={8}
          style={styles.remove}
        >
          <Ionicons name="close" size={14} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingLeft: spacing.xs,
    paddingRight: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    maxWidth: "100%",
  },
  icon: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
  },
  iconFallback: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  iconFallbackText: {
    ...typography.overline,
    color: colors.accentSoft,
  },
  label: {
    ...typography.caption,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  remove: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
