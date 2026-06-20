import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../../constants/theme";

type LoadingStateProps = {
  message?: string;
};

/** Centered loading indicator with an optional explanatory label. */
export function LoadingState({ message }: LoadingStateProps) {
  return (
    <View style={styles.container} accessibilityLabel={message ?? "Loading"}>
      <ActivityIndicator size="large" color={colors.accentSoft} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxxl,
    gap: spacing.md,
  },
  message: {
    ...typography.subhead,
    color: colors.textSecondary,
  },
});
