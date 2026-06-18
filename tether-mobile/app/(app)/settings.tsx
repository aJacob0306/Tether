import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SettingsRow, SettingsSection } from "../../components/SettingsSection";
import { useAuth } from "../../contexts/AuthContext";
import { appStyles } from "../../constants/styles";
import { fetchMyProfile, updateMyDisplayName } from "../../lib/profile";
import { supabase, type ActiveTab } from "../../lib/supabase";

function formatUpdatedAt(iso: string) {
  return new Date(iso).toLocaleString();
}

export default function SettingsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [settingsError, setSettingsError] = useState("");

  const userId = session?.user.id;
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

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

  const loadActivity = useCallback(async () => {
    const { data, error } = await supabase.from("active_tabs").select("*").maybeSingle();
    if (error) {
      setSettingsError(error.message);
    } else {
      setActiveTab(data);
    }
    setActivityLoading(false);
  }, []);

  useEffect(() => {
    loadProfile();
    loadActivity();
  }, [loadActivity, loadProfile]);

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

  if (!session) {
    return null;
  }

  return (
    <SafeAreaView style={appStyles.screen} edges={["top", "bottom", "left", "right"]}>
      <View style={appStyles.topBar}>
        <Pressable onPress={() => router.back()} style={appStyles.headerIconButton}>
          <Text style={appStyles.headerIconText}>BACK</Text>
        </Pressable>
        <Text style={appStyles.headerTitle}>Settings</Text>
        <View style={appStyles.headerSpacer} />
      </View>

      <ScrollView
        style={appStyles.settingsScroll}
        contentContainerStyle={appStyles.settingsContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SettingsSection title="Account">
          <View style={appStyles.settingsRow}>
            <View style={appStyles.settingsRowBody}>
              <Text style={appStyles.settingsRowLabel}>Display name</Text>
              {profileLoading ? (
                <ActivityIndicator size="small" color="#e6b4ff" style={{ marginTop: 8 }} />
              ) : (
                <>
                  <TextInput
                    style={appStyles.settingsInput}
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Your name"
                    placeholderTextColor="#6b7280"
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                  <Pressable
                    style={[
                      appStyles.secondaryButton,
                      savingName && appStyles.buttonDisabled,
                      { marginTop: 10 },
                    ]}
                    onPress={handleSaveDisplayName}
                    disabled={savingName || !displayName.trim()}
                  >
                    {savingName ? (
                      <ActivityIndicator color="#e2bae1" />
                    ) : (
                      <Text style={appStyles.secondaryButtonText}>Save name</Text>
                    )}
                  </Pressable>
                </>
              )}
            </View>
          </View>
          <SettingsRow
            label="Email"
            value={session.user.email ?? "Unknown"}
            last
          />
        </SettingsSection>

        <SettingsSection
          title="Notifications"
          footer="Push alerts when someone in your tether starts working on an allowed app or site."
        >
          <SettingsRow label="Work alerts" hint="Requires a development build on iOS" last>
            <Switch
              value={pushEnabled}
              onValueChange={setPushEnabled}
              trackColor={{ false: "#2d2f31", true: "#945cb4" }}
              thumbColor="#fff"
            />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Desktop activity">
          {activityLoading ? (
            <ActivityIndicator style={appStyles.tabLoader} size="small" />
          ) : (
            <>
              <SettingsRow
                label="Session"
                value={activeTab ? "Live" : "Idle"}
              />
              {activeTab ? (
                <SettingsRow
                  label="Current focus"
                  value={activeTab.title || "Untitled tab"}
                  hint={activeTab.url}
                />
              ) : (
                <SettingsRow
                  label="Sync status"
                  value="Nothing synced"
                  hint="Use the Chrome extension or desktop companion to sync activity."
                  last
                />
              )}
              {activeTab ? (
                <SettingsRow
                  label="Last updated"
                  value={formatUpdatedAt(activeTab.updated_at)}
                  last
                />
              ) : null}
            </>
          )}
        </SettingsSection>

        <SettingsSection title="About">
          <SettingsRow label="Version" value={appVersion} />
          <SettingsRow
            label="How Tether works"
            value="Desktop companion + mobile alerts"
            hint="Track allowed apps and sites, stay accountable with your crew."
            last
          />
        </SettingsSection>

        {profileError ? <Text style={appStyles.error}>{profileError}</Text> : null}
        {settingsError ? <Text style={appStyles.error}>{settingsError}</Text> : null}

        <Pressable style={[appStyles.secondaryButton, appStyles.settingsDangerButton]} onPress={handleSignOut}>
          <Text style={appStyles.secondaryButtonText}>Sign out</Text>
        </Pressable>
      </ScrollView>

      <StatusBar style="auto" />
    </SafeAreaView>
  );
}
