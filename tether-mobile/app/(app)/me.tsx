import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";
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
    <View style={appStyles.container}>
      <Pressable onPress={() => router.back()} style={{ marginBottom: 16 }}>
        <Text style={appStyles.linkText}>Back to tethers</Text>
      </Pressable>

      <Text style={appStyles.title}>My activity</Text>
      <Text style={appStyles.subtitle}>Active tab on your computer · updates live</Text>

      {tabLoading ? (
        <ActivityIndicator style={appStyles.tabLoader} size="large" />
      ) : tabError ? (
        <Text style={appStyles.error}>{tabError}</Text>
      ) : activeTab ? (
        <View style={appStyles.tabCard}>
          <Text style={appStyles.tabTitle}>{activeTab.title || "Untitled tab"}</Text>
          <Text style={appStyles.tabUrl}>{activeTab.url}</Text>
          <Text style={appStyles.tabUpdated}>Updated {formatUpdatedAt(activeTab.updated_at)}</Text>
        </View>
      ) : (
        <Text style={appStyles.hint}>
          Nothing synced yet. Switch tabs in Chrome or tap Sync now in the extension.
        </Text>
      )}

      <Pressable
        style={[appStyles.primaryButton, refreshing && appStyles.buttonDisabled]}
        onPress={handleRefresh}
        disabled={refreshing || tabLoading}
      >
        {refreshing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={appStyles.primaryButtonText}>Refresh</Text>
        )}
      </Pressable>

      <Text style={appStyles.signedInAs}>Signed in as {session.user.email}</Text>

      <Pressable style={appStyles.secondaryButton} onPress={handleSignOut}>
        <Text style={appStyles.secondaryButtonText}>Sign out</Text>
      </Pressable>
      <StatusBar style="auto" />
    </View>
  );
}
