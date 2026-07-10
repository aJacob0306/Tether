import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  AppScreen,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  SectionHeader,
  TetherCard,
} from "../../../components/ui";
import { colors, radius, spacing, typography } from "../../../constants/theme";
import { setMyActiveTether } from "../../../lib/profile";
import {
  deleteTether,
  fetchMyTethers,
  leaveTether,
  type TetherSummary,
} from "../../../lib/tethers";

type SortKey = "recent" | "name";

export default function TetherListScreen() {
  const router = useRouter();
  const [tethers, setTethers] = useState<TetherSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("recent");
  const [busyTetherId, setBusyTetherId] = useState<string | null>(null);

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
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [searchQuery, sortBy, tethers]);

  const hasTethers = tethers.length > 0;

  async function handleSetActive(tether: TetherSummary) {
    if (tether.isActive || busyTetherId) return;
    setBusyTetherId(tether.id);
    setError("");
    try {
      await setMyActiveTether(tether.id);
      setTethers((prev) =>
        prev
          .map((row) => ({
            ...row,
            isActive: row.id === tether.id,
          }))
          .sort((a, b) => {
            if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          }),
      );
    } catch (err) {
      Alert.alert(
        "Couldn’t set active tether",
        err instanceof Error ? err.message : "Failed to set active tether.",
      );
    } finally {
      setBusyTetherId(null);
    }
  }

  function handleLeaveOrDelete(tether: TetherSummary) {
    if (busyTetherId) return;

    const isCreator = tether.isCreator;
    const title = isCreator ? "Delete tether?" : "Leave tether?";
    const message = isCreator
      ? `Delete “${tether.name}” for everyone? This cannot be undone.`
      : `Leave “${tether.name}”? You can rejoin later with an invite code.`;

    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: isCreator ? "Delete" : "Leave",
        style: "destructive",
        onPress: async () => {
          setBusyTetherId(tether.id);
          try {
            if (isCreator) {
              await deleteTether(tether.id);
            } else {
              await leaveTether(tether.id);
            }
            setTethers((prev) => prev.filter((row) => row.id !== tether.id));
          } catch (err) {
            Alert.alert(
              isCreator ? "Couldn’t delete tether" : "Couldn’t leave tether",
              err instanceof Error
                ? err.message
                : isCreator
                  ? "Failed to delete tether."
                  : "Failed to leave tether.",
            );
          } finally {
            setBusyTetherId(null);
          }
        },
      },
    ]);
  }

  return (
    <AppScreen edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>T</Text>
          </View>
          <View>
            <Text style={styles.brandTitle}>Tether</Text>
            <Text style={styles.brandSubtitle}>Your accountability spaces</Text>
          </View>
        </View>
        <IconButton
          icon="person-circle-outline"
          onPress={() => router.push("/settings")}
          accessibilityLabel="Profile and settings"
          size={24}
        />
      </View>

      <View style={styles.actionRow}>
        <Card
          style={styles.actionCard}
          onPress={() => router.push("/create")}
          accessibilityLabel="Create tether"
          accessibilityHint="Start a new private workspace"
        >
          <View style={styles.actionIcon}>
            <Ionicons name="add" size={24} color={colors.accentSoft} />
          </View>
          <Text style={styles.actionTitle}>Create</Text>
          <Text style={styles.actionSubtitle}>Start a new space</Text>
        </Card>

        <Card
          style={styles.actionCard}
          onPress={() => router.push("/join")}
          accessibilityLabel="Join tether"
          accessibilityHint="Enter an invite code from your group"
        >
          <View style={[styles.actionIcon, styles.actionIconSecondary]}>
            <Ionicons name="enter-outline" size={22} color={colors.accentSoft} />
          </View>
          <Text style={styles.actionTitle}>Join</Text>
          <Text style={styles.actionSubtitle}>Enter an invite code</Text>
        </Card>
      </View>

      {loading ? (
        <LoadingState message="Loading your tethers…" />
      ) : error ? (
        <ErrorState message={error} onRetry={loadTethers} />
      ) : !hasTethers ? (
        <EmptyState
          icon="people-outline"
          title="No tethers yet"
          message="Create your first tether or join one with an invite code to start working alongside your crew."
          actionLabel="Create a tether"
          onAction={() => router.push("/create")}
        />
      ) : (
        <>
          {tethers.length > 3 ? (
            <View style={styles.searchRow}>
              <View style={styles.searchInputWrap}>
                <Ionicons name="search" size={16} color={colors.textTertiary} />
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search tethers"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Search tethers"
                />
              </View>
              <IconButton
                icon="swap-vertical"
                onPress={() => setShowFilters((shown) => !shown)}
                accessibilityLabel="Sort tethers"
              />
            </View>
          ) : null}

          {showFilters ? (
            <View style={styles.sortRow}>
              {(["recent", "name"] as const).map((sort) => {
                const active = sortBy === sort;
                return (
                  <Pressable
                    key={sort}
                    onPress={() => setSortBy(sort)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[styles.sortChip, active && styles.sortChipActive]}
                  >
                    <Text
                      style={[styles.sortChipText, active && styles.sortChipTextActive]}
                    >
                      {sort === "recent" ? "Most recent" : "Name"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <SectionHeader title="Your tethers" count={visibleTethers.length} />
          <Text style={styles.swipeHint}>
            Swipe left for Active or Leave/Delete.
          </Text>

          <FlatList
            style={styles.list}
            contentContainerStyle={styles.listContent}
            data={visibleTethers}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <Text style={styles.noMatch}>
                No tethers match “{searchQuery.trim()}”.
              </Text>
            }
            renderItem={({ item }) => (
              <TetherCard
                name={item.name}
                memberCount={item.memberCount}
                inviteCode={item.invite_code}
                isActive={item.isActive}
                isCreator={item.isCreator}
                onPress={() => router.push(`/tether/${item.id}`)}
                onSetActive={() => handleSetActive(item)}
                onLeaveOrDelete={() => handleLeaveOrDelete(item)}
              />
            )}
          />
        </>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xl,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  brandMarkText: {
    ...typography.heading,
    color: colors.accentSoft,
  },
  brandTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  brandSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  actionCard: {
    flex: 1,
    gap: spacing.xs,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  actionIconSecondary: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  actionTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  actionSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  searchRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    paddingVertical: spacing.sm,
  },
  sortRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  sortChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 40,
    justifyContent: "center",
  },
  sortChipActive: {
    backgroundColor: colors.accentSurface,
    borderColor: colors.accentBorder,
  },
  sortChipText: {
    ...typography.label,
    color: colors.textSecondary,
  },
  sortChipTextActive: {
    color: colors.accentSoft,
  },
  swipeHint: {
    ...typography.caption,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  noMatch: {
    ...typography.subhead,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xl,
  },
});
