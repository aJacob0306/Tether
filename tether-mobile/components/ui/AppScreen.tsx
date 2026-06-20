import type { ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { colors, spacing } from "../../constants/theme";

type AppScreenProps = {
  children: ReactNode;
  /** Horizontal padding around content. Defaults to true. */
  padded?: boolean;
  edges?: Edge[];
  style?: ViewStyle;
};

/**
 * Standard safe-area screen wrapper. Provides a consistent background, padding,
 * and status bar so every screen starts from the same layout baseline.
 */
export function AppScreen({
  children,
  padded = true,
  edges = ["top", "bottom", "left", "right"],
  style,
}: AppScreenProps) {
  return (
    <SafeAreaView
      style={[styles.safeArea, padded && styles.padded, style]}
      edges={edges}
    >
      <View style={styles.content}>{children}</View>
      <StatusBar style="light" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  padded: {
    paddingHorizontal: spacing.xl,
  },
  content: {
    flex: 1,
  },
});
