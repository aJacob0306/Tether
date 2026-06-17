import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { appStyles, authStyles } from "../../constants/styles";
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
      if (next.has(appId)) {
        next.delete(appId);
      } else {
        next.add(appId);
      }
      return next;
    });
  }

  function handleRefreshApps() {
    setRefreshingApps(true);
    loadDetectedApps();
  }

  function appSubtitle(app: DetectedTool): string {
    return app.bundle_identifier ?? app.platform;
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
      return <Image source={{ uri: iconUri }} style={appStyles.detectedAppIcon} />;
    }

    return (
      <View style={appStyles.detectedAppIconFallback}>
        <Text style={appStyles.detectedAppIconFallbackText}>
          {app.display_name.trim().charAt(0).toUpperCase() || "A"}
        </Text>
      </View>
    );
  }

  async function handleCreate() {
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
    <SafeAreaView style={appStyles.safeArea} edges={["top", "bottom", "left", "right"]}>
      <ScrollView
        style={appStyles.screen}
        contentContainerStyle={appStyles.createContent}
        keyboardShouldPersistTaps="handled"
      >
      <Text style={authStyles.title}>Create tether</Text>
      <Text style={authStyles.subtitle}>Start a shared accountability space for your group.</Text>

      <Text style={authStyles.label}>Tether name</Text>
      <TextInput
        style={authStyles.input}
        value={name}
        onChangeText={setName}
        placeholder="Study Crew"
        placeholderTextColor="#999"
        autoFocus
      />

      <View style={appStyles.detectedAppsHeader}>
        <View style={appStyles.detectedAppsHeaderText}>
          <Text style={authStyles.label}>Allowed desktop apps</Text>
          <Text style={appStyles.hint}>
            Search apps synced from the desktop companion, then select what should
            count as work for this tether.
          </Text>
        </View>
        <Pressable
          style={[
            appStyles.detectedAppsRefreshButton,
            refreshingApps && appStyles.buttonDisabled,
          ]}
          onPress={handleRefreshApps}
          disabled={refreshingApps || loadingApps}
        >
          <Text style={appStyles.detectedAppsRefreshText}>
            {refreshingApps ? "Refreshing..." : "Refresh"}
          </Text>
        </Pressable>
      </View>

      <View style={appStyles.selectedAppsPanel}>
        <Text style={appStyles.selectedAppsTitle}>
          Selected apps ({selectedApps.length})
        </Text>
        {selectedApps.length ? (
          selectedApps.map((app) => (
            <View key={app.id} style={appStyles.selectedAppRow}>
              {renderAppIcon(app)}
              <View style={appStyles.detectedAppRowText}>
                <Text style={appStyles.detectedAppName}>{app.display_name}</Text>
                <Text style={appStyles.detectedAppMeta}>{appSubtitle(app)}</Text>
              </View>
              <Pressable
                style={appStyles.selectedAppRemoveButton}
                onPress={() => toggleApp(app.id)}
              >
                <Text style={appStyles.selectedAppRemoveText}>Remove</Text>
              </Pressable>
            </View>
          ))
        ) : (
          <Text style={appStyles.emptyState}>
            No apps selected yet. Search below and tap apps to add them.
          </Text>
        )}
      </View>

      <TextInput
        style={appStyles.detectedAppsSearchInput}
        value={appSearch}
        onChangeText={setAppSearch}
        placeholder="Search apps like Xcode, Slack, Figma..."
        placeholderTextColor="#999"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={appStyles.detectedAppsList}>
        {loadingApps ? (
          <ActivityIndicator style={appStyles.tabLoader} size="small" />
        ) : detectedApps.length ? (
          filteredApps.length ? (
            filteredApps.map((app) => {
              const selected = selectedAppIds.has(app.id);
              return (
                <Pressable
                  key={app.id}
                  style={[
                    appStyles.detectedAppRow,
                    selected && appStyles.detectedAppRowSelected,
                  ]}
                  onPress={() => toggleApp(app.id)}
                >
                  {renderAppIcon(app)}
                  <View style={appStyles.detectedAppRowText}>
                    <Text style={appStyles.detectedAppName}>{app.display_name}</Text>
                    <Text style={appStyles.detectedAppMeta}>{appSubtitle(app)}</Text>
                  </View>
                  <Text
                    style={[
                      appStyles.detectedAppCheck,
                      selected && appStyles.detectedAppCheckSelected,
                    ]}
                  >
                    {selected ? "Selected" : "Add"}
                  </Text>
                </Pressable>
              );
            })
          ) : (
            <Text style={appStyles.emptyState}>
              No detected apps match "{appSearch.trim()}".
            </Text>
          )
        ) : (
          <Text style={appStyles.emptyState}>
            No desktop apps detected yet. Sign into the desktop companion on your computer,
            then refresh this list.
          </Text>
        )}
      </View>

      <Pressable
        style={[authStyles.primaryButton, creating && authStyles.buttonDisabled]}
        onPress={handleCreate}
        disabled={creating}
      >
        {creating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={authStyles.primaryButtonText}>Create</Text>
        )}
      </Pressable>

      {error ? <Text style={authStyles.error}>{error}</Text> : null}

      <Pressable style={authStyles.linkButton} onPress={() => router.back()}>
        <Text style={authStyles.linkText}>Cancel</Text>
      </Pressable>

        <StatusBar style="auto" />
      </ScrollView>
    </SafeAreaView>
  );
}
