import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, type ViewStyle } from "react-native";
import { colors, radius, touchTarget } from "../../constants/theme";

type IoniconName = keyof typeof Ionicons.glyphMap;

type IconButtonProps = {
  icon: IoniconName;
  onPress: () => void;
  /** Required for screen readers since the button is icon-only. */
  accessibilityLabel: string;
  variant?: "surface" | "ghost";
  disabled?: boolean;
  color?: string;
  size?: number;
  style?: ViewStyle;
};

/**
 * Accessible icon-only button with a comfortable 44px tap target.
 * Replaces ad-hoc text-glyph buttons ("BACK", "SET", ">").
 */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  variant = "surface",
  disabled = false,
  color = colors.accentSoft,
  size = 20,
  style,
}: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        variant === "surface" && styles.surface,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  surface: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.4,
  },
});
