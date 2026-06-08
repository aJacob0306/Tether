import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { appStyles } from "../constants/styles";
import {
  addTetherAllowlistEntry,
  allowlistTypeLabel,
  fetchTetherAllowlist,
  removeTetherAllowlistEntry,
} from "../lib/allowlist";
import type { AllowedTarget, AllowedTargetType } from "../lib/supabase";

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
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

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
          <FlatList
            style={appStyles.allowlistList}
            contentContainerStyle={appStyles.allowlistListContent}
            data={entries}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <Text style={appStyles.emptyState}>
                {isCreator
                  ? "No allowed targets yet. Add a website or app below."
                  : "The creator has not added any allowed targets yet."}
              </Text>
            }
            renderItem={({ item }) => (
              <View style={appStyles.allowlistRow}>
                <View style={appStyles.allowlistRowText}>
                  <Text style={appStyles.allowlistTypeBadge}>
                    {allowlistTypeLabel(item.target_type)}
                  </Text>
                  <Text style={appStyles.allowlistValue}>{item.value}</Text>
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
            )}
          />

          {isCreator ? (
            <View style={appStyles.allowlistForm}>
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
