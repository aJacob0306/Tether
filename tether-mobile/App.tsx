import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase, type ActiveTab } from "./lib/supabase";

function formatUpdatedAt(iso: string) {
  return new Date(iso).toLocaleString();
}

function ActiveTabView({ session }: { session: Session }) {
  const [activeTab, setActiveTab] = useState<ActiveTab | null>(null);
  const [tabLoading, setTabLoading] = useState(true);
  const [tabError, setTabError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

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
    let cancelled = false;

    fetchActiveTab().finally(() => {
      if (!cancelled) setTabLoading(false);
    });

    const channel = supabase
      .channel(`active-tab-${session.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "active_tabs",
          filter: `user_id=eq.${session.user.id}`,
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
  }, [session.user.id]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchActiveTab();
    setRefreshing(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tether</Text>
      <Text style={styles.subtitle}>Active tab on your computer · updates live</Text>

      {tabLoading ? (
        <ActivityIndicator style={styles.tabLoader} size="large" />
      ) : tabError ? (
        <Text style={styles.error}>{tabError}</Text>
      ) : activeTab ? (
        <View style={styles.tabCard}>
          <Text style={styles.tabTitle}>{activeTab.title || "Untitled tab"}</Text>
          <Text style={styles.tabUrl}>{activeTab.url}</Text>
          <Text style={styles.tabUpdated}>Updated {formatUpdatedAt(activeTab.updated_at)}</Text>
        </View>
      ) : (
        <Text style={styles.hint}>
          Nothing synced yet. Switch tabs in Chrome or tap Sync now in the extension.
        </Text>
      )}

      <Pressable
        style={[styles.primaryButton, refreshing && styles.buttonDisabled]}
        onPress={handleRefresh}
        disabled={refreshing || tabLoading}
      >
        {refreshing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Refresh</Text>
        )}
      </Pressable>

      <Text style={styles.signedInAs}>Signed in as {session.user.email}</Text>

      <Pressable style={styles.secondaryButton} onPress={handleSignOut}>
        <Text style={styles.secondaryButtonText}>Sign out</Text>
      </Pressable>
      <StatusBar style="auto" />
    </View>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSignIn() {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setError("Enter your email and password.");
      return;
    }

    setSigningIn(true);
    setError("");

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    setSigningIn(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    setPassword("");
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <StatusBar style="auto" />
      </View>
    );
  }

  if (session) {
    return <ActiveTabView session={session} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tether</Text>
      <Text style={styles.subtitle}>Sign in with the same account as the Chrome extension.</Text>

      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="you@example.com"
        placeholderTextColor="#999"
      />

      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        autoComplete="password"
        secureTextEntry
        placeholder="Password"
        placeholderTextColor="#999"
      />

      <Pressable
        style={[styles.primaryButton, signingIn && styles.buttonDisabled]}
        onPress={handleSignIn}
        disabled={signingIn}
      >
        {signingIn ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Sign in</Text>
        )}
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 24,
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#555",
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 16,
    color: "#111",
  },
  primaryButton: {
    backgroundColor: "#111",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: "#f3f3f3",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  secondaryButtonText: {
    color: "#111",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  tabLoader: {
    marginVertical: 32,
  },
  tabCard: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    backgroundColor: "#fafafa",
  },
  tabTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111",
    marginBottom: 8,
  },
  tabUrl: {
    fontSize: 14,
    color: "#2563eb",
    marginBottom: 8,
  },
  tabUpdated: {
    fontSize: 12,
    color: "#666",
  },
  signedInAs: {
    fontSize: 13,
    color: "#666",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  hint: {
    fontSize: 14,
    color: "#555",
  },
  error: {
    marginTop: 16,
    fontSize: 14,
    color: "#b00020",
  },
});
