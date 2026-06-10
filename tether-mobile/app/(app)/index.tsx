import { Link, useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { appStyles } from "../../constants/styles";
import type { Tether } from "../../lib/supabase";
import { fetchMyTethers } from "../../lib/tethers";

export default function TetherListScreen() {
  const router = useRouter();
  const [tethers, setTethers] = useState<Tether[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<"recent" | "name" | "code">("recent");

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

  const visibleTethers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matches = tethers.filter((tether) => {
      if (!query) return true;
      return [tether.name, tether.invite_code]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });

    return matches.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "code") return a.invite_code.localeCompare(b.invite_code);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [searchQuery, sortBy, tethers]);

  function tetherInitial(name: string) {
    return name.trim().charAt(0).toUpperCase() || "T";
  }

  return (
    <SafeAreaView style={appStyles.screen} edges={["top", "bottom", "left", "right"]}>
      <View style={appStyles.topBar}>
        <View style={appStyles.brandRow}>
          <View style={appStyles.brandMark}>
            <Text style={appStyles.brandMarkText}>T</Text>
          </View>
          <Text style={appStyles.title}>Tether</Text>
        </View>
        <Link href="/me" asChild>
          <Pressable style={appStyles.headerIconButton}>
            <Text style={appStyles.headerIconText}>ME</Text>
          </Pressable>
        </Link>
      </View>

      <Text style={appStyles.subtitle}>
        Private workspaces where your crew can see who is focused and what is being tracked.
      </Text>

      <View style={appStyles.actionStack}>
        <Pressable
          style={[appStyles.actionCard, appStyles.actionCardCompact]}
          onPress={() => router.push("/create")}
        >
          <View style={[appStyles.actionIcon, appStyles.actionIconCompact]}>
            <Text style={appStyles.actionIconText}>+</Text>
          </View>
          <View style={appStyles.actionBody}>
            <Text style={appStyles.actionTitle}>Create Tether</Text>
            <Text style={appStyles.actionSubtitle}>Start a new private workspace</Text>
          </View>
        </Pressable>

        <Pressable
          style={[appStyles.actionCard, appStyles.actionCardCompact]}
          onPress={() => router.push("/join")}
        >
          <View
            style={[
              appStyles.actionIcon,
              appStyles.actionIconSecondary,
              appStyles.actionIconCompact,
            ]}
          >
            <Text style={appStyles.actionIconText}>J</Text>
          </View>
          <View style={appStyles.actionBody}>
            <Text style={appStyles.actionTitle}>Join Tether</Text>
            <Text style={appStyles.actionSubtitle}>Enter an invite code from your group</Text>
          </View>
        </Pressable>
      </View>

      <View style={appStyles.searchRow}>
        <TextInput
          style={appStyles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search active tethers..."
          placeholderTextColor="#6b7280"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          style={[appStyles.filterButton, showFilters && appStyles.filterButtonActive]}
          onPress={() => setShowFilters((shown) => !shown)}
        >
          <Text
            style={[
              appStyles.filterButtonText,
              showFilters && appStyles.filterButtonTextActive,
            ]}
          >
            F
          </Text>
        </Pressable>
      </View>

      {showFilters ? (
        <View style={appStyles.filterPanel}>
          <Text style={appStyles.sectionLabel}>Workspace Order</Text>
          <View style={appStyles.sortRow}>
            {(["recent", "name", "code"] as const).map((sort) => (
              <Pressable
                key={sort}
                style={[appStyles.sortChip, sortBy === sort && appStyles.sortChipActive]}
                onPress={() => setSortBy(sort)}
              >
                <Text
                  style={[
                    appStyles.sortChipText,
                    sortBy === sort && appStyles.sortChipTextActive,
                  ]}
                >
                  {sort}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <Text style={appStyles.sectionLabel}>Active Tethers ({visibleTethers.length})</Text>

      {loading ? (
        <ActivityIndicator style={appStyles.tabLoader} size="large" />
      ) : error ? (
        <Text style={appStyles.error}>{error}</Text>
      ) : (
        <FlatList
          style={appStyles.list}
          contentContainerStyle={appStyles.listContent}
          data={visibleTethers}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          ListEmptyComponent={
            <Text style={appStyles.emptyState}>
              No tethers match your search. Create one or join with an invite code.
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={appStyles.tetherCard}
              onPress={() => router.push(`/tether/${item.id}`)}
            >
              <View style={appStyles.tetherCardRow}>
                <View style={appStyles.tetherAvatar}>
                  <Text style={appStyles.tetherAvatarText}>{tetherInitial(item.name)}</Text>
                </View>
                <View style={appStyles.tetherCardBody}>
                  <Text style={appStyles.tetherCardTitle}>{item.name}</Text>
                  <Text style={appStyles.tetherCardMeta}>Invite code {item.invite_code}</Text>
                </View>
                <Text style={appStyles.cardChevron}>{">"}</Text>
              </View>
              <View style={appStyles.tetherCardFooter}>
                <View style={[appStyles.badge, appStyles.badgeActive]}>
                  <Text style={[appStyles.badgeText, appStyles.badgeActiveText]}>
                    Connected
                  </Text>
                </View>
                <View style={appStyles.badge}>
                  <Text style={appStyles.badgeText}>Live telemetry</Text>
                </View>
              </View>
            </Pressable>
          )}
        />
      )}

      <StatusBar style="auto" />
    </SafeAreaView>
  );
}
