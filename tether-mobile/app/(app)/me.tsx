import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../contexts/AuthContext";
import { appStyles } from "../../constants/styles";
import { supabase, type ActiveTab } from "../../lib/supabase";

function formatUpdatedAt(iso: string) {
  return new Date(iso).toLocaleString();
}

export default function MeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab | null>(null);
  const [tabLoading, setTabLoading] = useState(true);
  const [tabError, setTabError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const userId = session?.user.id;

  async function fetchActiveTab() {
    setTabError("");

    const { data, error } = await supabase.from("active_tabs").select("*").maybeSingle();

    if (error) {
      setTabError(error.message);
      return;
    }

    setActiveTab(data);
  }

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    fetchActiveTab().finally(() => {
      if (!cancelled) setTabLoading(false);
    });

    const channel = supabase
      .channel(`active-tab-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "active_tabs",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setActiveTab(null);
            return;
          }

          setActiveTab(payload.new as ActiveTab);
          setTabError("");
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchActiveTab();
    setRefreshing(false);
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
        <Pressable
          style={[appStyles.headerIconButton, refreshing && appStyles.buttonDisabled]}
          onPress={handleRefresh}
          disabled={refreshing || tabLoading}
        >
          <Text style={appStyles.headerIconText}>{refreshing ? "SYNC" : "REFRESH"}</Text>
        </Pressable>
      </View>

      <View style={appStyles.profileHero}>
        <View style={appStyles.profileAvatar}>
          <Text style={appStyles.profileAvatarText}>
            {session.user.email?.charAt(0).toUpperCase() ?? "T"}
          </Text>
        </View>
        <View style={appStyles.profileBadge}>
          <Text style={appStyles.profileBadgeText}>Desktop telemetry</Text>
        </View>
        <Text style={appStyles.profileName}>My activity</Text>
        <Text style={appStyles.profileBio}>
          Active work from your computer appears here and updates live for the tethers
          you belong to.
        </Text>
      </View>

      <View style={appStyles.metricGrid}>
        <View style={appStyles.metricCard}>
          <Text style={appStyles.metricLabel}>Session</Text>
          <Text style={appStyles.metricValue}>{activeTab ? "Live" : "Idle"}</Text>
        </View>
        <View style={appStyles.metricCard}>
          <Text style={appStyles.metricLabel}>Source</Text>
          <Text style={appStyles.metricValue}>Mac</Text>
        </View>
      </View>

      {tabLoading ? (
        <ActivityIndicator style={appStyles.tabLoader} size="large" />
      ) : tabError ? (
        <Text style={appStyles.error}>{tabError}</Text>
      ) : activeTab ? (
        <View style={appStyles.tabCard}>
          <Text style={appStyles.sectionLabel}>Current Focus</Text>
          <Text style={appStyles.tabTitle}>{activeTab.title || "Untitled tab"}</Text>
          <Text style={appStyles.tabUrl}>{activeTab.url}</Text>
          <Text style={appStyles.tabUpdated}>Updated {formatUpdatedAt(activeTab.updated_at)}</Text>
        </View>
      ) : (
        <Text style={appStyles.hint}>
          Nothing synced yet. Switch tabs in Chrome or tap Sync now in the extension.
        </Text>
      )}

      <Text style={appStyles.signedInAs}>Signed in as {session.user.email}</Text>

      <Pressable style={appStyles.secondaryButton} onPress={handleSignOut}>
        <Text style={appStyles.secondaryButtonText}>Sign out</Text>
      </Pressable>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}
