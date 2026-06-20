import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../constants/theme";

type IoniconName = keyof typeof Ionicons.glyphMap;

type StatSummaryCardProps = {
  label: string;
  value: string;
  icon?: IoniconName;
  /** Optional secondary line under the value. */
  caption?: string;
};

/** Compact metric tile for dashboards. Designed to sit in a row of 2–3. */
export function StatSummaryCard({
  label,
  value,
  icon,
  caption,
}: StatSummaryCardProps) {
  return (
    <View
      style={styles.card}
      accessibilityLabel={`${label}: ${value}${caption ? `, ${caption}` : ""}`}
    >
      <View style={styles.header}>
        {icon ? (
          <Ionicons name={icon} size={14} color={colors.textTertiary} />
        ) : null}
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={styles.value}>{value}</Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  label: {
    ...typography.overline,
    color: colors.textTertiary,
    textTransform: "uppercase",
  },
  value: {
    ...typography.title,
    color: colors.textPrimary,
  },
  caption: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});
