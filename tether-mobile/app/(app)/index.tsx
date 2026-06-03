import { Link, useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { appStyles } from "../../constants/styles";
import type { Tether } from "../../lib/supabase";
import { fetchMyTethers } from "../../lib/tethers";

export default function TetherListScreen() {
  const router = useRouter();
  const [tethers, setTethers] = useState<Tether[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadTethers = useCallback(async () => {
    setError("");
    try {
      const data = await fetchMyTethers();
      setTethers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tethers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadTethers();
    }, [loadTethers]),
  );

  return (
    <View style={appStyles.screen}>
      <View style={appStyles.topBar}>
        <Text style={appStyles.title}>Tether</Text>
        <Link href="/me" asChild>
          <Pressable>
            <Text style={appStyles.linkText}>My activity</Text>
          </Pressable>
        </Link>
      </View>

      <Text style={appStyles.subtitle}>Your accountability groups</Text>

      {loading ? (
        <ActivityIndicator style={appStyles.tabLoader} size="large" />
      ) : error ? (
        <Text style={appStyles.error}>{error}</Text>
      ) : (
        <FlatList
          style={appStyles.list}
          contentContainerStyle={appStyles.listContent}
          data={tethers}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          ListEmptyComponent={
            <Text style={appStyles.emptyState}>
              No tethers yet. Create one or join with an invite code.
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={appStyles.tetherCard}
              onPress={() => router.push(`/tether/${item.id}`)}
            >
              <Text style={appStyles.tetherCardTitle}>{item.name}</Text>
              <Text style={appStyles.tetherCardMeta}>Code: {item.invite_code}</Text>
            </Pressable>
          )}
        />
      )}

      <View style={appStyles.rowActions}>
        <Pressable
          style={[appStyles.primaryButton, appStyles.flexButton]}
          onPress={() => router.push("/create")}
        >
          <Text style={appStyles.primaryButtonText}>Create tether</Text>
        </Pressable>
        <Pressable
          style={[appStyles.secondaryButton, appStyles.flexButton, { marginTop: 8 }]}
          onPress={() => router.push("/join")}
        >
          <Text style={appStyles.secondaryButtonText}>Join tether</Text>
        </Pressable>
      </View>

      <StatusBar style="auto" />
    </View>
  );
}
