import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  AppScreen,
  Button,
  IconButton,
  ScreenHeader,
  SectionHeader,
  ToolChip,
} from "../../components/ui";
import { colors, radius, spacing, typography } from "../../constants/theme";
import { fetchDetectedApps } from "../../lib/detected-tools";
import { getErrorMessage } from "../../lib/errors";
import { createTether } from "../../lib/tethers";
import type { DetectedTool } from "../../lib/supabase";

export default function CreateTetherScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [appSearch, setAppSearch] = useState("");
  const [detectedApps, setDetectedApps] = useState<DetectedTool[]>([]);
  const [selectedAppIds, setSelectedAppIds] = useState<Set<string>>(new Set());
  const [loadingApps, setLoadingApps] = useState(true);
  const [refreshingApps, setRefreshingApps] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const selectedApps = useMemo(
    () => detectedApps.filter((app) => selectedAppIds.has(app.id)),
    [detectedApps, selectedAppIds],
  );

  const filteredApps = useMemo(() => {
    const query = appSearch.trim().toLowerCase();
    if (!query) return detectedApps;
    return detectedApps.filter((app) =>
      [app.display_name, app.value, app.bundle_identifier, app.platform]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [appSearch, detectedApps]);

  const loadDetectedApps = useCallback(async () => {
    setError("");
    try {
      const apps = await fetchDetectedApps();
      setDetectedApps(apps);
      setSelectedAppIds((prev) => {
        const availableIds = new Set(apps.map((app) => app.id));
        return new Set([...prev].filter((id) => availableIds.has(id)));
      });
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load detected apps."));
    } finally {
      setLoadingApps(false);
      setRefreshingApps(false);
    }
  }, []);

  useEffect(() => {
    loadDetectedApps();
  }, [loadDetectedApps]);

  function toggleApp(appId: string) {
    setSelectedAppIds((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
  }

  function handleRefreshApps() {
    setRefreshingApps(true);
    loadDetectedApps();
  }

  function appIconUri(app: DetectedTool): string | null {
    const iconDataUrl = app.metadata.iconDataUrl;
    return typeof iconDataUrl === "string" && iconDataUrl.startsWith("data:image/")
      ? iconDataUrl
      : null;
  }

  function renderAppIcon(app: DetectedTool) {
    const iconUri = appIconUri(app);
    if (iconUri) {
      return <Image source={{ uri: iconUri }} style={styles.appIcon} />;
    }
    return (
      <View style={styles.appIconFallback}>
        <Text style={styles.appIconFallbackText}>
          {app.display_name.trim().charAt(0).toUpperCase() || "A"}
        </Text>
      </View>
    );
  }

  async function handleCreate() {
    if (!name.trim()) {
      setError("Enter a name for your tether.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const tether = await createTether(name, selectedApps);
      router.replace(`/tether/${tether.id}`);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create tether."));
      setCreating(false);
    }
  }

  return (
    <AppScreen>
      <ScreenHeader title="Create tether" onBack={() => router.back()} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          A tether is a shared space where your group can see who is focused and what
          counts as work.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Tether name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Study Crew"
            placeholderTextColor={colors.textTertiary}
            autoFocus
            accessibilityLabel="Tether name"
            returnKeyType="done"
          />
        </View>

        <SectionHeader
          title="Tracked apps"
          count={selectedApps.length}
          action={
            <IconButton
              icon="refresh"
              onPress={handleRefreshApps}
              accessibilityLabel="Refresh detected apps"
              variant="ghost"
              disabled={refreshingApps || loadingApps}
              size={18}
            />
          }
        />
        <Text style={styles.helper}>
          Choose which desktop apps count as work. These sync from the desktop companion.
        </Text>

        {selectedApps.length > 0 ? (
          <View style={styles.chips}>
            {selectedApps.map((app) => (
              <ToolChip
                key={app.id}
                label={app.display_name}
                iconUri={appIconUri(app)}
                onRemove={() => toggleApp(app.id)}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            value={appSearch}
            onChangeText={setAppSearch}
            placeholder="Search apps like Xcode, Slack, Figma"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search apps"
          />
        </View>

        <View style={styles.appList}>
          {loadingApps ? (
            <ActivityIndicator
              style={styles.listLoader}
              size="small"
              color={colors.accentSoft}
            />
          ) : detectedApps.length === 0 ? (
            <View style={styles.notice}>
              <Ionicons name="laptop-outline" size={20} color={colors.textTertiary} />
              <Text style={styles.noticeText}>
                No desktop apps detected yet. Sign in to the desktop companion on your
                computer, then refresh.
              </Text>
            </View>
          ) : filteredApps.length === 0 ? (
            <Text style={styles.noMatch}>
              No apps match “{appSearch.trim()}”.
            </Text>
          ) : (
            filteredApps.map((app) => {
              const selected = selectedAppIds.has(app.id);
              return (
                <Pressable
                  key={app.id}
                  onPress={() => toggleApp(app.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={app.display_name}
                  style={[styles.appRow, selected && styles.appRowSelected]}
                >
                  {renderAppIcon(app)}
                  <View style={styles.appRowText}>
                    <Text style={styles.appName} numberOfLines={1}>
                      {app.display_name}
                    </Text>
                    <Text style={styles.appMeta} numberOfLines={1}>
                      {app.bundle_identifier ?? app.platform}
                    </Text>
                  </View>
                  <Ionicons
                    name={selected ? "checkmark-circle" : "add-circle-outline"}
                    size={24}
                    color={selected ? colors.workingSoft : colors.textTertiary}
                  />
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Button
          label="Create tether"
          onPress={handleCreate}
          loading={creating}
          disabled={!name.trim()}
        />
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
  intro: {
    ...typography.subhead,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  field: {
    marginBottom: spacing.xl,
  },
  label: {
    ...typography.label,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
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
  helper: {
    ...typography.caption,
    color: colors.textTertiary,
    marginBottom: spacing.md,
    marginTop: -spacing.xs,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    paddingVertical: spacing.sm,
  },
  appList: {
    gap: spacing.sm,
  },
  listLoader: {
    marginVertical: spacing.xl,
  },
  appRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 56,
    backgroundColor: colors.surface,
  },
  appRowSelected: {
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSurface,
  },
  appIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
  },
  appIconFallback: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  appIconFallbackText: {
    ...typography.bodyStrong,
    color: colors.accentSoft,
  },
  appRowText: {
    flex: 1,
  },
  appName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  appMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  notice: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  noticeText: {
    ...typography.subhead,
    color: colors.textSecondary,
    flex: 1,
  },
  noMatch: {
    ...typography.subhead,
    color: colors.textSecondary,
    textAlign: "center",
    marginVertical: spacing.lg,
  },
  footer: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
});
