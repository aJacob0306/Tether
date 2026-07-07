import { Ionicons } from "@expo/vector-icons";
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
import { colors, radius, spacing, typography } from "../constants/theme";
import {
  Card,
  EmptyState,
  IconButton,
  ModalSheet,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
} from "./ui";
import {
  addDetectedAppAllowlistEntry,
  addTetherAllowlistEntry,
  fetchTetherAllowlist,
  removeTetherAllowlistEntry,
} from "../lib/allowlist";
import { fetchTetherDetectedApps } from "../lib/detected-tools";
import type { AllowedTarget, DetectedTool } from "../lib/supabase";

type AllowlistPanelProps = {
  tetherId: string;
  canManageAllowlist: boolean;
};

type AddTab = "apps" | "websites";

function iconUriFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const iconDataUrl = metadata?.iconDataUrl;
  return typeof iconDataUrl === "string" && iconDataUrl.startsWith("data:image/")
    ? iconDataUrl
    : null;
}

function TargetIcon({
  metadata,
  fallbackIcon,
}: {
  metadata?: Record<string, unknown> | null;
  fallbackIcon: "laptop-outline" | "globe-outline";
}) {
  const iconUri = iconUriFromMetadata(metadata);
  if (iconUri) {
    return <Image source={{ uri: iconUri }} style={styles.targetIcon} />;
  }
  return (
    <View style={styles.targetIconFallback}>
      <Ionicons name={fallbackIcon} size={16} color={colors.accentSoft} />
    </View>
  );
}

export function AllowlistPanel({ tetherId, canManageAllowlist }: AllowlistPanelProps) {
  const [entries, setEntries] = useState<AllowedTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [addTab, setAddTab] = useState<AddTab>("apps");
  const [appSearch, setAppSearch] = useState("");
  const [detectedApps, setDetectedApps] = useState<DetectedTool[]>([]);
  const [loadingDetectedApps, setLoadingDetectedApps] = useState(false);
  const [addingDetectedAppId, setAddingDetectedAppId] = useState<string | null>(null);
  const [websiteValue, setWebsiteValue] = useState("");
  const [savingWebsite, setSavingWebsite] = useState(false);
  const [sheetError, setSheetError] = useState("");

  const appEntries = useMemo(
    () => entries.filter((entry) => entry.target_type === "app"),
    [entries],
  );
  const websiteEntries = useMemo(
    () => entries.filter((entry) => entry.target_type === "domain"),
    [entries],
  );

  const allowedAppValues = useMemo(
    () => new Set(appEntries.map((entry) => entry.value.trim().toLowerCase())),
    [appEntries],
  );

  const filteredDetectedApps = useMemo(() => {
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

  const loadAllowlist = useCallback(async () => {
    setError("");
    try {
      const data = await fetchTetherAllowlist(tetherId);
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load allowlist.");
    } finally {
      setLoading(false);
    }
  }, [tetherId]);

  useEffect(() => {
    setLoading(true);
    loadAllowlist();
  }, [loadAllowlist]);

  const loadDetectedApps = useCallback(async () => {
    if (!canManageAllowlist) return;

    setLoadingDetectedApps(true);
    setSheetError("");
    try {
      const apps = await fetchTetherDetectedApps(tetherId);
      setDetectedApps(apps);
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : "Failed to load detected apps.");
    } finally {
      setLoadingDetectedApps(false);
    }
  }, [canManageAllowlist, tetherId]);

  useEffect(() => {
    loadDetectedApps();
  }, [loadDetectedApps]);

  function insertEntry(entry: AllowedTarget) {
    setEntries((prev) =>
      [...prev, entry].sort((a, b) => {
        if (a.target_type !== b.target_type) {
          return a.target_type.localeCompare(b.target_type);
        }
        return a.value.localeCompare(b.value);
      }),
    );
  }

  async function handleAddDetectedApp(app: DetectedTool) {
    setAddingDetectedAppId(app.id);
    setSheetError("");

    try {
      const entry = await addDetectedAppAllowlistEntry(tetherId, app);
      insertEntry(entry);
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : "Failed to add app.");
    } finally {
      setAddingDetectedAppId(null);
    }
  }

  async function handleAddWebsite() {
    setSavingWebsite(true);
    setSheetError("");

    try {
      const entry = await addTetherAllowlistEntry(tetherId, "domain", websiteValue);
      insertEntry(entry);
      setWebsiteValue("");
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : "Failed to add website.");
    } finally {
      setSavingWebsite(false);
    }
  }

  async function handleRemove(entry: AllowedTarget) {
    setRemovingId(entry.id);
    setError("");

    try {
      await removeTetherAllowlistEntry(entry.id);
      setEntries((prev) => prev.filter((row) => row.id !== entry.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove entry.");
    } finally {
      setRemovingId(null);
    }
  }

  function openSheet() {
    setSheetError("");
    setSheetVisible(true);
  }

  function renderEntryRow(entry: AllowedTarget, last: boolean) {
    const name = entry.display_name ?? entry.value;
    const showValue = Boolean(entry.display_name && entry.display_name !== entry.value);

    return (
      <View key={entry.id} style={[styles.entryRow, last && styles.entryRowLast]}>
        <TargetIcon
          metadata={entry.metadata}
          fallbackIcon={entry.target_type === "app" ? "laptop-outline" : "globe-outline"}
        />
        <View style={styles.entryBody}>
          <Text style={styles.entryName} numberOfLines={1}>
            {name}
          </Text>
          {showValue ? (
            <Text style={styles.entryMeta} numberOfLines={1}>
              {entry.value}
            </Text>
          ) : null}
        </View>
        {canManageAllowlist ? (
          removingId === entry.id ? (
            <ActivityIndicator size="small" color={colors.danger} />
          ) : (
            <IconButton
              icon="close"
              variant="ghost"
              color={colors.textSecondary}
              size={18}
              onPress={() => handleRemove(entry)}
              accessibilityLabel={`Remove ${name} from tracked work`}
            />
          )
        ) : null}
      </View>
    );
  }

  function renderEntryGroup(
    title: string,
    groupEntries: AllowedTarget[],
    emptyMessage: string,
  ) {
    return (
      <View style={styles.group}>
        <SectionHeader title={title} count={groupEntries.length} />
        <Card padded={false}>
          {groupEntries.length ? (
            groupEntries.map((entry, index) =>
              renderEntryRow(entry, index === groupEntries.length - 1),
            )
          ) : (
            <Text style={styles.groupEmpty}>{emptyMessage}</Text>
          )}
        </Card>
      </View>
    );
  }

  return (
    <View>
      <SectionHeader title="What counts as work" />
      <Text style={styles.description}>
        Time on these apps and websites shows the group you&apos;re working. The desktop
        companion tracks apps; the browser extension tracks websites.
      </Text>

      {loading ? (
        <ActivityIndicator
          style={styles.loader}
          size="large"
          color={colors.accentSoft}
        />
      ) : entries.length === 0 ? (
        <EmptyState
          icon="briefcase-outline"
          title="Nothing tracked yet"
          message={
            canManageAllowlist
              ? "Add the apps and websites that count as work for this tether."
              : "An admin hasn't added any tracked apps or websites yet."
          }
          actionLabel={canManageAllowlist ? "Add app or website" : undefined}
          onAction={canManageAllowlist ? openSheet : undefined}
        />
      ) : (
        <>
          {renderEntryGroup(
            "Apps",
            appEntries,
            "No desktop apps are tracked yet.",
          )}
          {renderEntryGroup(
            "Websites",
            websiteEntries,
            "No websites are tracked yet.",
          )}

          {canManageAllowlist ? (
            <SecondaryButton
              label="Add app or website"
              icon="add"
              onPress={openSheet}
            />
          ) : null}
        </>
      )}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <ModalSheet
        visible={sheetVisible}
        title="Add tracked work"
        onClose={() => setSheetVisible(false)}
      >
        <View style={styles.segment} accessibilityRole="tablist">
          {(["apps", "websites"] as const).map((tab) => {
            const selected = addTab === tab;
            return (
              <Pressable
                key={tab}
                onPress={() => setAddTab(tab)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={tab === "apps" ? "Desktop apps" : "Websites"}
                style={[styles.segmentButton, selected && styles.segmentButtonActive]}
              >
                <Text
                  style={[styles.segmentLabel, selected && styles.segmentLabelActive]}
                >
                  {tab === "apps" ? "Apps" : "Websites"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {addTab === "apps" ? (
          <>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={16} color={colors.textTertiary} />
              <TextInput
                style={styles.searchInput}
                value={appSearch}
                onChangeText={setAppSearch}
                placeholder="Search synced apps"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Search synced apps"
              />
              <IconButton
                icon="refresh"
                variant="ghost"
                size={18}
                onPress={loadDetectedApps}
                disabled={loadingDetectedApps}
                accessibilityLabel="Refresh synced apps"
              />
            </View>

            <ScrollView
              style={styles.appList}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {loadingDetectedApps ? (
                <ActivityIndicator
                  style={styles.loader}
                  size="small"
                  color={colors.accentSoft}
                />
              ) : detectedApps.length === 0 ? (
                <Text style={styles.sheetEmpty}>
                  No desktop apps synced yet. Sign in to the desktop companion on your
                  computer, then refresh.
                </Text>
              ) : filteredDetectedApps.length === 0 ? (
                <Text style={styles.sheetEmpty}>
                  No synced apps match “{appSearch.trim()}”.
                </Text>
              ) : (
                filteredDetectedApps.map((app) => {
                  const alreadyAdded = allowedAppValues.has(
                    app.value.trim().toLowerCase(),
                  );
                  return (
                    <Pressable
                      key={app.id}
                      onPress={() => handleAddDetectedApp(app)}
                      disabled={alreadyAdded || addingDetectedAppId === app.id}
                      accessibilityRole="button"
                      accessibilityLabel={
                        alreadyAdded
                          ? `${app.display_name}, already added`
                          : `Add ${app.display_name}`
                      }
                      style={({ pressed }) => [
                        styles.appRow,
                        alreadyAdded && styles.appRowAdded,
                        pressed && !alreadyAdded && styles.appRowPressed,
                      ]}
                    >
                      <TargetIcon metadata={app.metadata} fallbackIcon="laptop-outline" />
                      <View style={styles.entryBody}>
                        <Text style={styles.entryName} numberOfLines={1}>
                          {app.display_name}
                        </Text>
                        <Text style={styles.entryMeta} numberOfLines={1}>
                          {app.bundle_identifier ?? app.platform}
                        </Text>
                      </View>
                      {addingDetectedAppId === app.id ? (
                        <ActivityIndicator size="small" color={colors.accentSoft} />
                      ) : (
                        <Ionicons
                          name={alreadyAdded ? "checkmark-circle" : "add-circle-outline"}
                          size={24}
                          color={alreadyAdded ? colors.workingSoft : colors.textTertiary}
                        />
                      )}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </>
        ) : (
          <View>
            <Text style={styles.sheetHint}>
              Websites are matched by domain — for example, github.com counts any page on
              GitHub.
            </Text>
            <View style={styles.searchWrap}>
              <Ionicons name="globe-outline" size={16} color={colors.textTertiary} />
              <TextInput
                style={styles.searchInput}
                value={websiteValue}
                onChangeText={setWebsiteValue}
                placeholder="github.com"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                accessibilityLabel="Website domain"
                returnKeyType="done"
                onSubmitEditing={handleAddWebsite}
              />
            </View>
            <PrimaryButton
              label="Add website"
              onPress={handleAddWebsite}
              loading={savingWebsite}
              disabled={!websiteValue.trim()}
            />
          </View>
        )}

        {sheetError ? (
          <Text style={styles.error} accessibilityRole="alert">
            {sheetError}
          </Text>
        ) : null}
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  description: {
    ...typography.subhead,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  loader: {
    marginVertical: spacing.xl,
  },
  group: {
    marginBottom: spacing.lg,
  },
  groupEmpty: {
    ...typography.subhead,
    color: colors.textSecondary,
    padding: spacing.lg,
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  entryRowLast: {
    borderBottomWidth: 0,
  },
  entryBody: {
    flex: 1,
  },
  entryName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  entryMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  targetIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
  },
  targetIconFallback: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.md,
  },
  segment: {
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  segmentButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    minHeight: 40,
    borderRadius: radius.sm,
  },
  segmentButtonActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentLabel: {
    ...typography.label,
    color: colors.textSecondary,
  },
  segmentLabelActive: {
    color: colors.textPrimary,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    minHeight: 48,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    paddingVertical: spacing.sm,
  },
  appList: {
    maxHeight: 360,
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
    marginBottom: spacing.sm,
  },
  appRowAdded: {
    borderColor: colors.workingBorder,
  },
  appRowPressed: {
    opacity: 0.8,
  },
  sheetEmpty: {
    ...typography.subhead,
    color: colors.textSecondary,
    paddingVertical: spacing.lg,
    textAlign: "center",
  },
  sheetHint: {
    ...typography.subhead,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
});
