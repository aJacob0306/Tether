import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../../constants/theme";

type SectionHeaderProps = {
  title: string;
  /** Optional count or short status shown after the title. */
  count?: number | string;
  /** Optional element rendered on the right (e.g. a link/action). */
  action?: ReactNode;
};

/** Consistent label above a group of related content. */
export function SectionHeader({ title, count, action }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
        {count !== undefined ? (
          <Text style={styles.count}>  {count}</Text>
        ) : null}
      </Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  title: {
    ...typography.overline,
    color: colors.textTertiary,
    textTransform: "uppercase",
  },
  count: {
    color: colors.textSecondary,
  },
});
