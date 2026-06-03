import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { authStyles } from "../../constants/styles";
import { getErrorMessage } from "../../lib/errors";
import { createTether } from "../../lib/tethers";

export default function CreateTetherScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    setCreating(true);
    setError("");

    try {
      const tether = await createTether(name);
      router.replace(`/tether/${tether.id}`);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create tether."));
      setCreating(false);
    }
  }

  return (
    <View style={authStyles.container}>
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
    </View>
  );
}
