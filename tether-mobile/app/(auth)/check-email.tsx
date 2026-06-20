import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { AppScreen, Button } from "../../components/ui";
import { colors, radius, spacing, typography } from "../../constants/theme";

export default function CheckEmailScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();

  return (
    <AppScreen>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name="mail-outline" size={32} color={colors.accentSoft} />
        </View>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.message}>
          We sent a confirmation link{email ? ` to ${email}` : ""}. Open it to activate your
          account, then come back to sign in.
        </Text>

        <Button
          label="Back to sign in"
          onPress={() => router.replace("/login")}
          style={styles.action}
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.display,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  message: {
    ...typography.subhead,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 320,
  },
  action: {
    marginTop: spacing.xxl,
    alignSelf: "stretch",
  },
});
