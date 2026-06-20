import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../../constants/theme";
import { IconButton } from "./IconButton";

type ScreenHeaderProps = {
  title?: string;
  subtitle?: string;
  /** Shows a labeled back button on the left. */
  onBack?: () => void;
  /** Optional element rendered on the right (e.g. action buttons). */
  right?: ReactNode;
  /** Optional element rendered on the left when there is no back button. */
  left?: ReactNode;
};

/**
 * Consistent top bar used across stack screens. Keeps the back affordance,
 * title, and actions aligned and predictable on every screen.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
  left,
}: ScreenHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.side}>
          {onBack ? (
            <IconButton
              icon="chevron-back"
              onPress={onBack}
              accessibilityLabel="Go back"
            />
          ) : (
            left
          )}
        </View>

        {title ? (
          <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
        ) : (
          <View style={styles.titleSpacer} />
        )}

        <View style={[styles.side, styles.sideRight]}>{right}</View>
      </View>

      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    minHeight: 44,
  },
  side: {
    minWidth: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  sideRight: {
    justifyContent: "flex-end",
  },
  title: {
    ...typography.heading,
    color: colors.textPrimary,
    flex: 1,
    textAlign: "center",
  },
  titleSpacer: {
    flex: 1,
  },
  subtitle: {
    ...typography.subhead,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
});
