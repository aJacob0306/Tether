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
import { SafeAreaView } from "react-native-safe-area-context";
import { AllowlistPanel } from "../../../components/AllowlistPanel";
import { MemberCard } from "../../../components/MemberCard";
import { GroupFocusTimer } from "../../../components/GroupFocusTimer";
import { DetailedLog } from "../../../components/DetailedLog";
import { appStyles } from "../../../constants/styles";
import { useAuth } from "../../../contexts/AuthContext";
import { useTetherBoard } from "../../../hooks/useTetherBoard";
import { formatFocusDurationFromMs, getLiveDailyFocusMs } from "../../../lib/status";

type TetherTab = "home" | "rules" | "log";

export default function TetherBoardScreen() {
  const router = useRouter();
  const { session } = useAuth();
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
  const isCreator = Boolean(tether && session?.user.id === tether.created_by);
  const workingMembers = members.filter((member) => member.status === "working");
  const dailyFocusMs =
    dailyWorkMs + getLiveDailyFocusMs(workingMembers, localDayWindow.dayStart);
  const dailyGoalMs = 8 * 60 * 60 * 1000;
  const dailyProgress = Math.min(100, Math.round((dailyFocusMs / dailyGoalMs) * 100));

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
        <Pressable onPress={handleCopyInviteCode} style={appStyles.headerIconButton}>
          <Text style={appStyles.headerIconText}>{copied ? "COPIED" : "CODE"}</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={appStyles.tabLoader} size="large" />
      ) : error ? (
        <Text style={appStyles.error}>{error}</Text>
      ) : tether ? (
        <>
          <View style={appStyles.screenHeader}>
            <Text style={appStyles.title}>{tether.name}</Text>
            <Text style={appStyles.subtitle}>
              Live group activity, allowed work targets, and today's logged focus.
            </Text>
            <View style={appStyles.tetherCardFooter}>
              <View style={appStyles.badge}>
                <Text style={appStyles.badgeText}>Invite {tether.invite_code}</Text>
              </View>
              <View
                style={[
                  appStyles.badge,
                  workingMembers.length > 0 ? appStyles.badgeActive : null,
                ]}
              >
                <Text
                  style={[
                    appStyles.badgeText,
                    workingMembers.length > 0 ? appStyles.badgeActiveText : null,
                  ]}
                >
                  {workingMembers.length} working
                </Text>
              </View>
            </View>
          </View>

          {activeTab === "home" ? (
            <>
              <View style={appStyles.metricGrid}>
                <View style={appStyles.metricCard}>
                  <Text style={appStyles.metricLabel}>Today</Text>
                  <Text style={appStyles.metricValue}>
                    {formatFocusDurationFromMs(dailyFocusMs)}
                  </Text>
                </View>
                <View style={appStyles.metricCard}>
                  <Text style={appStyles.metricLabel}>Members</Text>
                  <Text style={appStyles.metricValue}>{members.length}</Text>
                </View>
              </View>

              <GroupFocusTimer
                members={members}
                dailyWorkMs={dailyWorkMs}
                dayStart={localDayWindow.dayStart}
              />

              <View style={appStyles.metricCard}>
                <Text style={appStyles.metricLabel}>Goal Progress</Text>
                <Text style={appStyles.tetherCardTitle}>
                  {dailyProgress}% toward an 8h group day
                </Text>
                <View style={appStyles.progressTrack}>
                  <View style={[appStyles.progressFill, { width: `${dailyProgress}%` }]} />
                </View>
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
                keyExtractor={(item) => item.user_id}
                renderItem={({ item }) => <MemberCard member={item} />}
              />
            </>
          ) : activeTab === "rules" ? (
            <AllowlistPanel tetherId={tether.id} isCreator={isCreator} />
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
              <Text style={appStyles.primaryButtonText}>Refresh telemetry</Text>
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
                activeTab === "rules" && appStyles.tetherTabButtonActive,
              ]}
              onPress={() => setActiveTab("rules")}
            >
              <Text
                style={[
                  appStyles.tetherTabIcon,
                  activeTab === "rules" && appStyles.tetherTabTextActive,
                ]}
              >
                R
              </Text>
              <Text
                style={[
                  appStyles.tetherTabLabel,
                  activeTab === "rules" && appStyles.tetherTabTextActive,
                ]}
              >
                Rules
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
                Log
              </Text>
            </Pressable>
          </View>
        </>
      ) : null}

      <StatusBar style="auto" />
    </SafeAreaView>
  );
}
