import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../../constants/theme";

type IoniconName = keyof typeof Ionicons.glyphMap;

type ListRowProps = {
  label: string;
  value?: string;
  hint?: string;
  icon?: IoniconName;
  /** Right-side content (switch, badge, etc). */
  right?: ReactNode;
  onPress?: () => void;
  /** Shows a chevron to signal navigation. Defaults to true when onPress set. */
  showChevron?: boolean;
  last?: boolean;
  accessibilityHint?: string;
};

/** Reusable settings/list row with consistent spacing and a 44px+ height. */
export function ListRow({
  label,
  value,
  hint,
  icon,
  right,
  onPress,
  showChevron,
  last = false,
  accessibilityHint,
}: ListRowProps) {
  const chevron = showChevron ?? Boolean(onPress);

  const content = (
    <>
      {icon ? (
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={18} color={colors.accentSoft} />
        </View>
      ) : null}
      <View style={styles.body}>
        <Text style={styles.label}>{label}</Text>
        {value ? <Text style={styles.value}>{value}</Text> : null}
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {right}
      {chevron ? (
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        style={({ pressed }) => [
          styles.row,
          last && styles.last,
          pressed && styles.pressed,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.row, last && styles.last]}>{content}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  last: {
    borderBottomWidth: 0,
  },
  pressed: {
    opacity: 0.7,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  label: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  value: {
    ...typography.subhead,
    color: colors.textSecondary,
  },
  hint: {
    ...typography.caption,
    color: colors.textTertiary,
  },
});
