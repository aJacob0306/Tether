import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { MemberCard } from "../../../components/MemberCard";
import { appStyles } from "../../../constants/styles";
import { useTetherBoard } from "../../../hooks/useTetherBoard";

export default function TetherBoardScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tether, members, loading, refreshing, error, refresh } = useTetherBoard(id);
  const [copied, setCopied] = useState(false);

  async function handleCopyInviteCode() {
    if (!tether?.invite_code) return;
    await Clipboard.setStringAsync(tether.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <View style={appStyles.screen}>
      <Pressable onPress={() => router.back()} style={{ marginBottom: 8 }}>
        <Text style={appStyles.linkText}>Back to tethers</Text>
      </Pressable>

      {loading ? (
        <ActivityIndicator style={appStyles.tabLoader} size="large" />
      ) : error ? (
        <Text style={appStyles.error}>{error}</Text>
      ) : tether ? (
        <>
          <View style={appStyles.screenHeader}>
            <Text style={appStyles.title}>{tether.name}</Text>
            <Text style={appStyles.subtitle}>Live group activity</Text>
            <Text style={appStyles.tetherCardMeta}>Invite code</Text>
            <Pressable onPress={handleCopyInviteCode}>
              <Text style={appStyles.inviteCode}>{tether.invite_code}</Text>
              <Text style={appStyles.tetherCardMeta}>
                {copied ? "Copied!" : "Tap to copy"}
              </Text>
            </Pressable>
          </View>

          {members.length === 1 ? (
            <Text style={appStyles.emptyState}>
              Share the invite code so others can join and you can see each other working.
            </Text>
          ) : null}

          <FlatList
            style={appStyles.list}
            contentContainerStyle={appStyles.listContent}
            data={members}
            keyExtractor={(item, index) => `${item.user_id}-${index}`}
            renderItem={({ item }) => <MemberCard member={item} />}
          />

          <Pressable
            style={[appStyles.primaryButton, refreshing && appStyles.buttonDisabled]}
            onPress={refresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={appStyles.primaryButtonText}>Refresh</Text>
            )}
          </Pressable>
        </>
      ) : null}

      <StatusBar style="auto" />
    </View>
  );
}
