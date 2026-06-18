import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AllowlistPanel } from "../../../../components/AllowlistPanel";
import { MemberPermissionsPanel } from "../../../../components/MemberPermissionsPanel";
import { SettingsRow, SettingsSection } from "../../../../components/SettingsSection";
import { useAuth } from "../../../../contexts/AuthContext";
import { appStyles } from "../../../../constants/styles";
import {
  canManageAllowlist,
  fetchTetherMembers,
  memberRoleLabel,
  type TetherMemberWithRole,
} from "../../../../lib/members";
import { fetchTether } from "../../../../lib/tethers";
import type { Tether } from "../../../../lib/supabase";

export default function TetherSettingsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tether, setTether] = useState<Tether | null>(null);
  const [members, setMembers] = useState<TetherMemberWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const userId = session?.user.id;
  const isCreator = Boolean(tether && userId && tether.created_by === userId);
  const canManage = tether && userId ? canManageAllowlist(tether, userId, members) : false;
  const myMember = members.find((member) => member.user_id === userId);

  const loadSettings = useCallback(async () => {
    if (!id) return;

    setError("");
    try {
      const [tetherData, memberRows] = await Promise.all([
        fetchTether(id),
        fetchTetherMembers(id),
      ]);
      setTether(tetherData);
      setMembers(memberRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    loadSettings();
  }, [loadSettings]);

  async function handleCopyInviteCode() {
    if (!tether?.invite_code) return;
    await Clipboard.setStringAsync(tether.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <SafeAreaView style={appStyles.screen} edges={["top", "bottom", "left", "right"]}>
      <View style={appStyles.topBar}>
        <Pressable onPress={() => router.back()} style={appStyles.headerIconButton}>
          <Text style={appStyles.headerIconText}>BACK</Text>
        </Pressable>
        <Text style={appStyles.headerTitle}>Workspace settings</Text>
        <View style={appStyles.headerSpacer} />
      </View>

      {loading ? (
        <ActivityIndicator style={appStyles.tabLoader} size="large" />
      ) : error ? (
        <Text style={appStyles.error}>{error}</Text>
      ) : tether ? (
        <ScrollView
          style={appStyles.settingsScroll}
          contentContainerStyle={appStyles.settingsContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={appStyles.title}>{tether.name}</Text>
          <Text style={appStyles.subtitle}>
            {isCreator
              ? "You created this workspace. Manage rules and member permissions below."
              : canManage
                ? "You can add or remove allowed apps and websites for this workspace."
                : "View workspace details. Only admins and delegated managers can edit rules."}
          </Text>

          <SettingsSection title="Workspace">
            <SettingsRow label="Name" value={tether.name} />
            <SettingsRow
              label="Invite code"
              value={tether.invite_code}
              hint="Share this code so others can join"
            />
            <Pressable
              style={[appStyles.settingsRow, appStyles.settingsRowLast]}
              onPress={handleCopyInviteCode}
            >
              <Text style={appStyles.settingsRowLabel}>
                {copied ? "Copied to clipboard" : "Copy invite code"}
              </Text>
            </Pressable>
          </SettingsSection>

          <SettingsSection title="Your role">
            <SettingsRow
              label={myMember?.display_name ?? "You"}
              value={myMember ? memberRoleLabel(myMember) : "Member"}
              hint={
                isCreator
                  ? "Full admin access"
                  : canManage
                    ? "Can edit the work allowlist"
                    : "View-only access to rules"
              }
              last
            />
          </SettingsSection>

          {isCreator ? (
            <MemberPermissionsPanel tetherId={tether.id} currentUserId={userId ?? ""} />
          ) : null}

          <AllowlistPanel tetherId={tether.id} canManageAllowlist={canManage} />
        </ScrollView>
      ) : null}

      <StatusBar style="auto" />
    </SafeAreaView>
  );
}
