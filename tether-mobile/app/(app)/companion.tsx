import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import {
  AppScreen,
  Button,
  ConnectionStatusCard,
  ScreenHeader,
  SectionHeader,
  type ConnectionStatus,
} from "../../components/ui";
import { colors, radius, spacing, typography } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";
import { useDeviceStatus } from "../../hooks/useDeviceStatus";
import { fetchDetectedApps } from "../../lib/detected-tools";
import { formatRelativeTime } from "../../lib/status";
import { supabase } from "../../lib/supabase";

const STEPS = [
  "Install the Tether desktop companion on your Mac or Windows computer.",
  "Sign in to the companion with this same Tether account.",
  "Let it sync your installed apps — they appear when you create or edit a tether.",
  "Come back here and tap Check connection.",
];

export default function CompanionScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const {
    status: deviceStatus,
    loading: deviceStatusLoading,
    refreshing: deviceStatusRefreshing,
    refresh: refreshDeviceStatus,
  } = useDeviceStatus();
  const email = session?.user.email;

  const [extensionStatus, setExtensionStatus] = useState<ConnectionStatus>("checking");
  const [appCount, setAppCount] = useState(0);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);

  const companionStatus: ConnectionStatus = deviceStatusLoading
    ? "checking"
    : deviceStatus?.hasRecentDesktop
      ? "connected"
      : "disconnected";

  const loadSecondaryConnectionDetails = useCallback(async () => {
    setExtensionStatus("checking");
    try {
      const [apps, activeTab] = await Promise.all([
        fetchDetectedApps(),
        supabase.from("active_tabs").select("user_id").maybeSingle(),
      ]);
      setAppCount(apps.length);
      setExtensionStatus(activeTab.data ? "connected" : "disconnected");
    } catch {
      setExtensionStatus("disconnected");
    }
  }, []);

  useEffect(() => {
    loadSecondaryConnectionDetails();
  }, [loadSecondaryConnectionDetails]);

  async function handleCheck() {
    setChecking(true);
    await Promise.all([refreshDeviceStatus(), loadSecondaryConnectionDetails()]);
    setChecking(false);
  }

  async function handleCopyEmail() {
    if (!email) return;
    await Clipboard.setStringAsync(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <AppScreen>
      <ScreenHeader title="Desktop companion" onBack={() => router.back()} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          The desktop companion detects the apps on your computer and reports when you&apos;re
          working on ones your tether tracks. It&apos;s what makes your focus visible to the group.
        </Text>

        <SectionHeader title="Connection status" />
        <View style={styles.statusStack}>
          <ConnectionStatusCard
            title="Desktop companion"
            status={companionStatus}
            description={
              companionStatus === "connected"
                ? `Desktop connected. Last seen ${formatRelativeTime(deviceStatus?.desktopLastSeenAt)}.${
                    appCount > 0
                      ? ` Synced ${appCount} ${appCount === 1 ? "app" : "apps"} from your computer.`
                      : ""
                  }`
                : "Desktop not connected. Open the companion and sign in with this same Tether account."
            }
          />
          <ConnectionStatusCard
            title="Browser extension"
            status={extensionStatus}
            description={
              extensionStatus === "connected"
                ? "Your browser is syncing allowlisted site activity."
                : "Optional — install the Chrome extension to also track websites."
            }
          />
        </View>

        <View style={styles.checkButton}>
          <Button
            label="Check connection"
            icon="refresh"
            variant="secondary"
            onPress={handleCheck}
            loading={checking || deviceStatusRefreshing}
          />
        </View>

        {companionStatus === "connected" ? (
          <View style={styles.doneNotice}>
            <Ionicons name="checkmark-circle" size={18} color={colors.workingSoft} />
            <Text style={styles.doneNoticeText}>
              Desktop connected — keep the companion running while you work.
            </Text>
          </View>
        ) : (
          <>
            <SectionHeader title="Setup steps" />
            <View style={styles.steps}>
              {STEPS.map((step, index) => (
                <View key={step} style={styles.step}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {email ? (
          <View style={styles.emailCard}>
            <View style={styles.emailRow}>
              <Ionicons name="mail-outline" size={18} color={colors.textSecondary} />
              <View style={styles.emailBody}>
                <Text style={styles.emailLabel}>Sign in on desktop with</Text>
                <Text style={styles.emailValue} numberOfLines={1}>
                  {email}
                </Text>
              </View>
            </View>
            <Button
              label={copied ? "Copied" : "Copy email"}
              icon={copied ? "checkmark" : "copy-outline"}
              variant="secondary"
              onPress={handleCopyEmail}
            />
          </View>
        ) : null}
      </ScrollView>
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
  intro: {
    ...typography.subhead,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  statusStack: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  checkButton: {
    marginBottom: spacing.xxl,
  },
  steps: {
    gap: spacing.lg,
    marginBottom: spacing.xxl,
  },
  step: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  doneNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.workingBorder,
    backgroundColor: colors.workingSurface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xxl,
  },
  doneNoticeText: {
    ...typography.subhead,
    color: colors.textPrimary,
    flex: 1,
  },
  stepNumberText: {
    ...typography.label,
    color: colors.accentSoft,
  },
  stepText: {
    ...typography.subhead,
    color: colors.textPrimary,
    flex: 1,
    paddingTop: 4,
  },
  emailCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.md,
  },
  emailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  emailBody: {
    flex: 1,
  },
  emailLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  emailValue: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
});
