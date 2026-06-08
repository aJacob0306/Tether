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
import { GroupFocusTimer } from "../../../components/GroupFocusTimer";
import { DetailedLog } from "../../../components/DetailedLog";
import { appStyles } from "../../../constants/styles";
import { useTetherBoard } from "../../../hooks/useTetherBoard";

type TetherTab = "home" | "log";

export default function TetherBoardScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    tether,
    members,
    loading,
    refreshing,
    error,
    dailyWorkMs,
    dailyMemberLogs,
    localDayWindow,
    refresh,
  } = useTetherBoard(id);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<TetherTab>("home");

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

          {activeTab === "home" ? (
            <>
              <GroupFocusTimer
                members={members}
                dailyWorkMs={dailyWorkMs}
                dayStart={localDayWindow.dayStart}
              />

              {members.length === 1 ? (
                <Text style={appStyles.emptyState}>
                  Share the invite code so others can join and you can see each other working.
                </Text>
              ) : null}

              <FlatList
                style={appStyles.list}
                contentContainerStyle={appStyles.listContent}
                data={members}
                keyExtractor={(item) => item.user_id}
                renderItem={({ item }) => <MemberCard member={item} />}
              />
            </>
          ) : (
            <DetailedLog
              logs={dailyMemberLogs}
              members={members}
              dayStart={localDayWindow.dayStart}
            />
          )}

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

          <View style={appStyles.tetherTabBar}>
            <Pressable
              style={[
                appStyles.tetherTabButton,
                activeTab === "home" && appStyles.tetherTabButtonActive,
              ]}
              onPress={() => setActiveTab("home")}
            >
              <Text
                style={[
                  appStyles.tetherTabIcon,
                  activeTab === "home" && appStyles.tetherTabTextActive,
                ]}
              >
                H
              </Text>
              <Text
                style={[
                  appStyles.tetherTabLabel,
                  activeTab === "home" && appStyles.tetherTabTextActive,
                ]}
              >
                Home
              </Text>
            </Pressable>

            <Pressable
              style={[
                appStyles.tetherTabButton,
                activeTab === "log" && appStyles.tetherTabButtonActive,
              ]}
              onPress={() => setActiveTab("log")}
            >
              <Text
                style={[
                  appStyles.tetherTabIcon,
                  activeTab === "log" && appStyles.tetherTabTextActive,
                ]}
              >
                L
              </Text>
              <Text
                style={[
                  appStyles.tetherTabLabel,
                  activeTab === "log" && appStyles.tetherTabTextActive,
                ]}
              >
                Detailed Log
              </Text>
            </Pressable>
          </View>
        </>
      ) : null}

      <StatusBar style="auto" />
    </View>
  );
}
