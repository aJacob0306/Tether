import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { appStyles } from "../constants/styles";
import {
  addDetectedAppAllowlistEntry,
  addTetherAllowlistEntry,
  allowlistTypeLabel,
  fetchTetherAllowlist,
  removeTetherAllowlistEntry,
} from "../lib/allowlist";
import { fetchDetectedApps } from "../lib/detected-tools";
import type { AllowedTarget, AllowedTargetType, DetectedTool } from "../lib/supabase";

type AllowlistPanelProps = {
  tetherId: string;
  isCreator: boolean;
};

const TYPE_OPTIONS: { type: AllowedTargetType; label: string; hint: string }[] = [
  { type: "domain", label: "Website", hint: "github.com" },
  { type: "app", label: "App", hint: "Visual Studio Code" },
];

export function AllowlistPanel({ tetherId, isCreator }: AllowlistPanelProps) {
  const [entries, setEntries] = useState<AllowedTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [targetType, setTargetType] = useState<AllowedTargetType>("domain");
  const [value, setValue] = useState("");
  const [detectedApps, setDetectedApps] = useState<DetectedTool[]>([]);
  const [appSearch, setAppSearch] = useState("");
  const [loadingDetectedApps, setLoadingDetectedApps] = useState(false);
  const [addingDetectedAppId, setAddingDetectedAppId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const appEntries = useMemo(
    () => entries.filter((entry) => entry.target_type === "app"),
    [entries],
  );
  const websiteEntries = useMemo(
    () => entries.filter((entry) => entry.target_type === "domain"),
    [entries],
  );

  const allowedAppValues = useMemo(() => {
    return new Set(
      appEntries.map((entry) => entry.value.trim().toLowerCase()),
    );
  }, [appEntries]);

  const filteredDetectedApps = useMemo(() => {
    const query = appSearch.trim().toLowerCase();
    if (!query) return detectedApps;

    return detectedApps.filter((app) => {
      const searchable = [
        app.display_name,
        app.value,
        app.bundle_identifier,
        app.platform,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
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
    if (!isCreator) return;

    setLoadingDetectedApps(true);
    setError("");
    try {
      const apps = await fetchDetectedApps();
      setDetectedApps(apps);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load detected apps.");
    } finally {
      setLoadingDetectedApps(false);
    }
  }, [isCreator]);

  useEffect(() => {
    loadDetectedApps();
  }, [loadDetectedApps]);

  async function handleAdd() {
    setSaving(true);
    setError("");

    try {
      const entry = await addTetherAllowlistEntry(tetherId, targetType, value);
      setEntries((prev) =>
        [...prev, entry].sort((a, b) => {
          if (a.target_type !== b.target_type) {
            return a.target_type.localeCompare(b.target_type);
          }
          return a.value.localeCompare(b.value);
        }),
      );
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add entry.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddDetectedApp(app: DetectedTool) {
    setAddingDetectedAppId(app.id);
    setError("");

    try {
      const entry = await addDetectedAppAllowlistEntry(tetherId, app);
      setEntries((prev) =>
        [...prev, entry].sort((a, b) => {
          if (a.target_type !== b.target_type) {
            return a.target_type.localeCompare(b.target_type);
          }
          return a.value.localeCompare(b.value);
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add app.");
    } finally {
      setAddingDetectedAppId(null);
    }
  }

  async function handleRemove(entryId: string) {
    setRemovingId(entryId);
    setError("");

    try {
      await removeTetherAllowlistEntry(entryId);
      setEntries((prev) => prev.filter((entry) => entry.id !== entryId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove entry.");
    } finally {
      setRemovingId(null);
    }
  }

  const selectedHint = TYPE_OPTIONS.find((option) => option.type === targetType)?.hint ?? "";

  function appIconUri(metadata: Record<string, unknown> | null | undefined): string | null {
    const iconDataUrl = metadata?.iconDataUrl;
    return typeof iconDataUrl === "string" && iconDataUrl.startsWith("data:image/")
      ? iconDataUrl
      : null;
  }

  function renderIcon(label: string, metadata?: Record<string, unknown> | null) {
    const iconUri = appIconUri(metadata);
    if (iconUri) {
      return <Image source={{ uri: iconUri }} style={appStyles.detectedAppIcon} />;
    }

    return (
      <View style={appStyles.detectedAppIconFallback}>
        <Text style={appStyles.detectedAppIconFallbackText}>
          {label.trim().charAt(0).toUpperCase() || "A"}
        </Text>
      </View>
    );
  }

  function renderCurrentEntry(item: AllowedTarget) {
    return (
      <View key={item.id} style={appStyles.allowlistRow}>
        {item.target_type === "app" ? renderIcon(item.value, item.metadata) : null}
        <View style={appStyles.allowlistRowText}>
          <Text style={appStyles.allowlistTypeBadge}>
            {allowlistTypeLabel(item.target_type)}
          </Text>
          <Text style={appStyles.allowlistValue}>{item.display_name ?? item.value}</Text>
          {item.display_name && item.display_name !== item.value ? (
            <Text style={appStyles.detectedAppMeta}>{item.value}</Text>
          ) : null}
        </View>
        {isCreator ? (
          <Pressable
            style={[
              appStyles.allowlistRemoveButton,
              removingId === item.id && appStyles.buttonDisabled,
            ]}
            onPress={() => handleRemove(item.id)}
            disabled={removingId === item.id}
          >
            {removingId === item.id ? (
              <ActivityIndicator size="small" color="#b00020" />
            ) : (
              <Text style={appStyles.allowlistRemoveText}>Remove</Text>
            )}
          </Pressable>
        ) : null}
      </View>
    );
  }

  function renderCurrentSection(
    title: string,
    sectionEntries: AllowedTarget[],
    emptyMessage: string,
  ) {
    return (
      <View style={appStyles.allowlistCurrentSection}>
        <Text style={appStyles.allowlistSectionTitle}>
          {title} ({sectionEntries.length})
        </Text>
        {sectionEntries.length ? (
          <View style={appStyles.allowlistCurrentList}>
            {sectionEntries.map(renderCurrentEntry)}
          </View>
        ) : (
          <Text style={appStyles.emptyState}>{emptyMessage}</Text>
        )}
      </View>
    );
  }

  return (
    <View style={appStyles.allowlistPanel}>
      <Text style={appStyles.allowlistTitle}>Work allowlist</Text>
      <Text style={appStyles.allowlistDescription}>
        Only these apps and websites count as work for this tether. The Chrome extension
        syncs allowlisted websites; desktop apps will be supported in the desktop app.
      </Text>

      {loading ? (
        <ActivityIndicator style={appStyles.tabLoader} size="large" />
      ) : (
        <>
          {renderCurrentSection(
            "Current apps",
            appEntries,
            isCreator
              ? "No apps added to this tether yet."
              : "The creator has not added any apps yet.",
          )}

          {renderCurrentSection(
            "Current websites",
            websiteEntries,
            isCreator
              ? "No websites added to this tether yet."
              : "The creator has not added any websites yet.",
          )}

          {!entries.length ? (
            <Text style={appStyles.emptyState}>
              {isCreator
                ? "Add apps or websites below to decide what counts as work for this tether."
                : "The creator has not added any allowed targets yet."}
            </Text>
          ) : null}

          {isCreator ? (
            <View style={appStyles.allowlistForm}>
              <Text style={appStyles.allowlistFormLabel}>Add detected desktop app</Text>
              <Text style={appStyles.hint}>
                Apps are synced from the desktop companion for this account.
              </Text>

              <TextInput
                style={appStyles.detectedAppsSearchInput}
                value={appSearch}
                onChangeText={setAppSearch}
                placeholder="Search synced apps"
                placeholderTextColor="#999"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <View style={appStyles.detectedAppsList}>
                {loadingDetectedApps ? (
                  <ActivityIndicator style={appStyles.tabLoader} size="small" />
                ) : detectedApps.length ? (
                  filteredDetectedApps.length ? (
                    filteredDetectedApps.map((app) => {
                      const alreadyAllowed = allowedAppValues.has(
                        app.value.trim().toLowerCase(),
                      );

                      return (
                        <Pressable
                          key={app.id}
                          style={[
                            appStyles.detectedAppRow,
                            alreadyAllowed && appStyles.detectedAppRowSelected,
                          ]}
                          onPress={() => handleAddDetectedApp(app)}
                          disabled={alreadyAllowed || addingDetectedAppId === app.id}
                        >
                          {renderIcon(app.display_name, app.metadata)}
                          <View style={appStyles.detectedAppRowText}>
                            <Text style={appStyles.detectedAppName}>{app.display_name}</Text>
                            <Text style={appStyles.detectedAppMeta}>
                              {app.bundle_identifier ?? app.platform}
                            </Text>
                          </View>
                          {addingDetectedAppId === app.id ? (
                            <ActivityIndicator size="small" color="#111" />
                          ) : (
                            <Text
                              style={[
                                appStyles.detectedAppCheck,
                                alreadyAllowed && appStyles.detectedAppCheckSelected,
                              ]}
                            >
                              {alreadyAllowed ? "Added" : "Add"}
                            </Text>
                          )}
                        </Pressable>
                      );
                    })
                  ) : (
                    <Text style={appStyles.emptyState}>
                      {appSearch.trim()
                        ? `No synced apps match "${appSearch.trim()}".`
                        : "No synced apps found."}
                    </Text>
                  )
                ) : (
                  <Text style={appStyles.emptyState}>
                    No desktop apps detected yet. Sign into the desktop companion,
                    sync apps, then refresh this screen.
                  </Text>
                )}
              </View>

              <Pressable
                style={[
                  appStyles.secondaryButton,
                  loadingDetectedApps && appStyles.buttonDisabled,
                ]}
                onPress={loadDetectedApps}
                disabled={loadingDetectedApps}
              >
                <Text style={appStyles.secondaryButtonText}>
                  {loadingDetectedApps ? "Refreshing apps..." : "Refresh synced apps"}
                </Text>
              </Pressable>

              <Text style={appStyles.allowlistFormLabel}>Add allowed target</Text>

              <View style={appStyles.allowlistTypeRow}>
                {TYPE_OPTIONS.map((option) => (
                  <Pressable
                    key={option.type}
                    style={[
                      appStyles.allowlistTypeButton,
                      targetType === option.type && appStyles.allowlistTypeButtonActive,
                    ]}
                    onPress={() => setTargetType(option.type)}
                  >
                    <Text
                      style={[
                        appStyles.allowlistTypeButtonText,
                        targetType === option.type && appStyles.allowlistTypeButtonTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <TextInput
                style={appStyles.allowlistInput}
                value={value}
                onChangeText={setValue}
                placeholder={selectedHint}
                placeholderTextColor="#999"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Pressable
                style={[appStyles.primaryButton, saving && appStyles.buttonDisabled]}
                onPress={handleAdd}
                disabled={saving || !value.trim()}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={appStyles.primaryButtonText}>Add to allowlist</Text>
                )}
              </Pressable>
            </View>
          ) : null}
        </>
      )}

      {error ? <Text style={appStyles.error}>{error}</Text> : null}
    </View>
  );
}
