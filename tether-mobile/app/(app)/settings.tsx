import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  AppScreen,
  Button,
  Card,
  ListRow,
  ScreenHeader,
  SectionHeader,
} from "../../components/ui";
import { useAuth } from "../../contexts/AuthContext";
import { colors, radius, spacing, typography } from "../../constants/theme";
import { useDeviceStatus } from "../../hooks/useDeviceStatus";
import {
  fetchMyActiveTetherOptions,
  fetchMyProfile,
  setMyActiveTether,
  updateMyDisplayName,
  type ActiveTetherOption,
} from "../../lib/profile";
import { supabase, type ActiveTab } from "../../lib/supabase";

function StatusText({ connected, label }: { connected: boolean; label: string }) {
  return (
    <View style={styles.statusText}>
      <Ionicons
        name={connected ? "checkmark-circle" : "ellipse-outline"}
        size={14}
        color={connected ? colors.workingSoft : colors.offline}
      />
      <Text
        style={[
          styles.statusTextLabel,
          { color: connected ? colors.workingSoft : colors.textSecondary },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab | null>(null);
  const { status: deviceStatus } = useDeviceStatus();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [tethers, setTethers] = useState<ActiveTetherOption[]>([]);
  const [activeTetherId, setActiveTetherId] = useState<string | null>(null);
  const [activeTetherLoading, setActiveTetherLoading] = useState(true);
  const [savingActiveTether, setSavingActiveTether] = useState(false);
  const [activeTetherError, setActiveTetherError] = useState("");

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const email = session?.user.email;

  const loadProfile = useCallback(async () => {
    setProfileError("");
    try {
      const profile = await fetchMyProfile();
      setDisplayName(profile?.display_name ?? "");
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to load profile.");
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const loadConnections = useCallback(async () => {
    const { data: tab } = await supabase.from("active_tabs").select("*").maybeSingle();
    setActiveTab(tab);
  }, []);

  const loadActiveTether = useCallback(async () => {
    setActiveTetherError("");
    try {
      const options = await fetchMyActiveTetherOptions();
      setTethers(options.tethers);
      setActiveTetherId(options.activeTetherId);
    } catch (err) {
      setActiveTetherError(
        err instanceof Error ? err.message : "Failed to load active tether.",
      );
    } finally {
      setActiveTetherLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
    loadConnections();
    loadActiveTether();
  }, [loadActiveTether, loadConnections, loadProfile]);

  async function handleSelectActiveTether(tetherId: string) {
    if (tetherId === activeTetherId) return;
    setSavingActiveTether(true);
    setActiveTetherError("");
    try {
      const nextId = await setMyActiveTether(tetherId);
      setActiveTetherId(nextId);
    } catch (err) {
      setActiveTetherError(
        err instanceof Error ? err.message : "Failed to set active tether.",
      );
    } finally {
      setSavingActiveTether(false);
    }
  }

  async function handleSaveDisplayName() {
    setSavingName(true);
    setProfileError("");
    try {
      const profile = await updateMyDisplayName(displayName);
      setDisplayName(profile.display_name);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to save name.");
    } finally {
      setSavingName(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  if (!session) return null;

  const initial = displayName.trim().charAt(0).toUpperCase() || "?";
  const companionConnected = Boolean(deviceStatus?.hasRecentDesktop);

  return (
    <AppScreen>
      <ScreenHeader title="Profile" onBack={() => router.back()} />

      <ScrollableContent>
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {displayName.trim() || "Your name"}
          </Text>
          {email ? <Text style={styles.email}>{email}</Text> : null}
        </View>

        <SectionHeader title="Display name" />
        <Card>
          {profileLoading ? (
            <ActivityIndicator color={colors.accentSoft} />
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your name"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="words"
                autoCorrect={false}
                accessibilityLabel="Display name"
              />
              <Button
                label="Save name"
                variant="secondary"
                onPress={handleSaveDisplayName}
                loading={savingName}
                disabled={!displayName.trim()}
                style={styles.saveButton}
              />
            </>
          )}
          {profileError ? (
            <Text style={styles.error} accessibilityRole="alert">
              {profileError}
            </Text>
          ) : null}
        </Card>

        <View style={styles.sectionGap}>
          <SectionHeader title="Active tether" />
          <Text style={styles.sectionHint}>
            When an app or site is allowed in more than one tether, time counts toward
            your active tether.
          </Text>
          <Card padded={false}>
            {activeTetherLoading ? (
              <View style={styles.inlineLoader}>
                <ActivityIndicator color={colors.accentSoft} />
              </View>
            ) : tethers.length === 0 ? (
              <ListRow
                icon="link-outline"
                label="No tethers yet"
                hint="Create or join a tether first"
                last
              />
            ) : tethers.length === 1 ? (
              <ListRow
                icon="checkmark-circle"
                label={tethers[0].name}
                hint="Automatically selected — your only tether"
                last
              />
            ) : (
              tethers.map((tether, index) => {
                const selected = tether.id === activeTetherId;
                return (
                  <ListRow
                    key={tether.id}
                    icon={selected ? "checkmark-circle" : "ellipse-outline"}
                    label={tether.name}
                    hint={selected ? "Counting work here when tools overlap" : "Tap to make active"}
                    onPress={() => handleSelectActiveTether(tether.id)}
                    showChevron={false}
                    last={index === tethers.length - 1}
                  />
                );
              })
            )}
          </Card>
          {savingActiveTether ? (
            <Text style={styles.savingHint}>Updating active tether…</Text>
          ) : null}
          {activeTetherError ? (
            <Text style={styles.error} accessibilityRole="alert">
              {activeTetherError}
            </Text>
          ) : null}
          {tethers.length > 1 && !activeTetherId && !activeTetherLoading ? (
            <Text style={styles.warningHint}>
              Pick an active tether so overlapping apps and sites can be attributed.
            </Text>
          ) : null}
        </View>

        <View style={styles.sectionGap}>
          <SectionHeader title="Connections" />
          <Card padded={false}>
            <ListRow
              icon="laptop-outline"
              label="Desktop companion"
              hint="Detects and tracks your work apps"
              onPress={() => router.push("/companion")}
              accessibilityHint="Open desktop companion setup"
              right={
                <StatusText
                  connected={companionConnected}
                  label={companionConnected ? "Connected" : "Set up"}
                />
              }
            />
            <ListRow
              icon="globe-outline"
              label="Browser extension"
              hint="Optional — tracks allowlisted websites"
              right={
                <StatusText
                  connected={Boolean(activeTab)}
                  label={activeTab ? "Connected" : "Not connected"}
                />
              }
              last
            />
          </Card>
        </View>

        <View style={styles.sectionGap}>
          <SectionHeader title="Notifications" />
          <Card padded={false}>
            <ListRow
              icon="notifications-outline"
              label="Work alerts"
              hint="Alerts when a teammate starts working. Requires a development build on iOS."
              right={
                <Switch
                  value={pushEnabled}
                  onValueChange={setPushEnabled}
                  trackColor={{ false: colors.border, true: colors.accent }}
                  thumbColor="#fff"
                  accessibilityLabel="Work alerts"
                />
              }
              last
            />
          </Card>
        </View>

        {activeTab ? (
          <View style={styles.sectionGap}>
            <SectionHeader title="Current activity" />
            <Card padded={false}>
              <ListRow
                icon="ellipse"
                label="Current focus"
                value={activeTab.title || "Untitled tab"}
                hint={activeTab.url}
                last
              />
            </Card>
          </View>
        ) : null}

        <View style={styles.sectionGap}>
          <SectionHeader title="About" />
          <Card padded={false}>
            <ListRow label="Version" value={appVersion} last />
          </Card>
        </View>

        <Button
          label="Sign out"
          icon="log-out-outline"
          variant="danger"
          onPress={handleSignOut}
          style={styles.signOut}
        />
      </ScrollableContent>
    </AppScreen>
  );
}

function ScrollableContent({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
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
    marginBottom: spacing.xxl,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: "700",
    color: colors.accentSoft,
  },
  name: {
    ...typography.title,
    color: colors.textPrimary,
  },
  email: {
    ...typography.subhead,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceAlt,
  },
  saveButton: {
    marginTop: spacing.md,
  },
  sectionGap: {
    marginTop: spacing.xl,
  },
  sectionHint: {
    ...typography.subhead,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  inlineLoader: {
    paddingVertical: spacing.xl,
    alignItems: "center",
  },
  savingHint: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  warningHint: {
    ...typography.subhead,
    color: colors.idleSoft,
    marginTop: spacing.md,
  },
  statusText: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  statusTextLabel: {
    ...typography.label,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.md,
  },
  signOut: {
    marginTop: spacing.xxl,
  },
});
