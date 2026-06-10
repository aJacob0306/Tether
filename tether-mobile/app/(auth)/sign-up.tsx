import { Link, useRouter } from "expo-router";
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
import { getAuthErrorMessage } from "../../lib/auth-errors";
import { supabase } from "../../lib/supabase";

export default function SignUpScreen() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [signingUp, setSigningUp] = useState(false);

  async function handleSignUp() {
    const trimmedName = displayName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setError("Enter your display name.");
      return;
    }

    if (!trimmedEmail || !password) {
      setError("Enter your email and password.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSigningUp(true);
    setError("");

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: { display_name: trimmedName },
      },
    });

    setSigningUp(false);

    if (signUpError) {
      setError(getAuthErrorMessage(signUpError.message));
      return;
    }

    if (data.session) {
      setPassword("");
      setConfirmPassword("");
      router.replace("/");
      return;
    }

    router.replace({
      pathname: "/check-email",
      params: { email: trimmedEmail },
    });
  }

  return (
    <SafeAreaView style={authStyles.container} edges={["top", "bottom", "left", "right"]}>
      <Text style={authStyles.title}>Create account</Text>
      <Text style={authStyles.subtitle}>Join Tether and stay accountable with your group.</Text>

      <Text style={authStyles.label}>Display name</Text>
      <TextInput
        style={authStyles.input}
        value={displayName}
        onChangeText={setDisplayName}
        autoCapitalize="words"
        autoComplete="name"
        placeholder="Alex"
        placeholderTextColor="#999"
      />

      <Text style={authStyles.label}>Email</Text>
      <TextInput
        style={authStyles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="you@example.com"
        placeholderTextColor="#999"
      />

      <Text style={authStyles.label}>Password</Text>
      <TextInput
        style={authStyles.input}
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        secureTextEntry
        placeholder="At least 6 characters"
        placeholderTextColor="#999"
      />

      <Text style={authStyles.label}>Confirm password</Text>
      <TextInput
        style={authStyles.input}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        autoComplete="new-password"
        secureTextEntry
        placeholder="Repeat password"
        placeholderTextColor="#999"
      />

      <Pressable
        style={[authStyles.primaryButton, signingUp && authStyles.buttonDisabled]}
        onPress={handleSignUp}
        disabled={signingUp}
      >
        {signingUp ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={authStyles.primaryButtonText}>Create account</Text>
        )}
      </Pressable>

      {error ? <Text style={authStyles.error}>{error}</Text> : null}

      <Link href="/login" asChild>
        <Pressable style={authStyles.linkButton}>
          <Text style={authStyles.linkText}>
            Already have an account? <Text style={authStyles.linkTextBold}>Sign in</Text>
          </Text>
        </Pressable>
      </Link>

      <StatusBar style="auto" />
    </SafeAreaView>
  );
}
