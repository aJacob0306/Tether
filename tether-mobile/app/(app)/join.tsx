import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authStyles } from "../../constants/styles";
import { joinTether } from "../../lib/tethers";

export default function JoinTetherScreen() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);

  async function handleJoin() {
    setJoining(true);
    setError("");

    try {
      const tetherId = await joinTether(inviteCode);
      router.replace(`/tether/${tetherId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join tether.");
      setJoining(false);
    }
  }

  return (
    <SafeAreaView style={authStyles.container} edges={["top", "bottom", "left", "right"]}>
      <Text style={authStyles.title}>Join tether</Text>
      <Text style={authStyles.subtitle}>Enter the invite code shared by your group.</Text>

      <Text style={authStyles.label}>Invite code</Text>
      <TextInput
        style={authStyles.input}
        value={inviteCode}
        onChangeText={setInviteCode}
        placeholder="ABCD1234"
        placeholderTextColor="#999"
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
      />

      <Pressable
        style={[authStyles.primaryButton, joining && authStyles.buttonDisabled]}
        onPress={handleJoin}
        disabled={joining}
      >
        {joining ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={authStyles.primaryButtonText}>Join</Text>
        )}
      </Pressable>

      {error ? <Text style={authStyles.error}>{error}</Text> : null}

      <Pressable style={authStyles.linkButton} onPress={() => router.back()}>
        <Text style={authStyles.linkText}>Cancel</Text>
      </Pressable>

      <StatusBar style="auto" />
    </SafeAreaView>
  );
}
