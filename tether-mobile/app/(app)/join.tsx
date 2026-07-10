import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  AppScreen,
  Button,
  ScreenHeader,
  TextInputField,
} from "../../components/ui";
import { colors, radius, spacing, typography } from "../../constants/theme";
import { ensureMyActiveTether } from "../../lib/profile";
import { joinTether } from "../../lib/tethers";

export default function JoinTetherScreen() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);

  async function handleJoin() {
    if (!inviteCode.trim()) {
      setError("Enter an invite code.");
      return;
    }
    setJoining(true);
    setError("");
    try {
      const tetherId = await joinTether(inviteCode);
      await ensureMyActiveTether().catch(() => null);
      router.replace(`/tether/${tetherId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join tether.");
      setJoining(false);
    }
  }

  return (
    <AppScreen>
      <ScreenHeader title="Join tether" onBack={() => router.back()} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="key-outline" size={28} color={colors.accentSoft} />
          </View>
          <Text style={styles.heroTitle}>Enter your invite code</Text>
          <Text style={styles.heroText}>
            Ask a member for their tether&apos;s invite code. Joining lets the group see when
            you&apos;re working on tracked apps and sites.
          </Text>
        </View>

        <TextInputField
          label="Invite code"
          value={inviteCode}
          onChangeText={(text) => {
            setInviteCode(text);
            if (error) setError("");
          }}
          placeholder="ABCD1234"
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          maxLength={12}
          error={error || undefined}
          returnKeyType="done"
          onSubmitEditing={handleJoin}
        />
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Join tether" onPress={handleJoin} loading={joining} />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  hero: {
    alignItems: "center",
    marginTop: spacing.lg,
    marginBottom: spacing.xxl,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  heroTitle: {
    ...typography.heading,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  heroText: {
    ...typography.subhead,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 320,
  },
  footer: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
