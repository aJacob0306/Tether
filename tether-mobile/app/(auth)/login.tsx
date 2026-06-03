import { Link } from "expo-router";
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
import { getAuthErrorMessage } from "../../lib/auth-errors";
import { supabase } from "../../lib/supabase";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  async function handleSignIn() {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setError("Enter your email and password.");
      return;
    }

    setSigningIn(true);
    setError("");

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    setSigningIn(false);

    if (signInError) {
      setError(getAuthErrorMessage(signInError.message));
      return;
    }

    setPassword("");
  }

  return (
    <View style={authStyles.container}>
      <Text style={authStyles.title}>Tether</Text>
      <Text style={authStyles.subtitle}>Sign in to your accountability space.</Text>

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
        autoComplete="password"
        secureTextEntry
        placeholder="Password"
        placeholderTextColor="#999"
      />

      <Pressable
        style={[authStyles.primaryButton, signingIn && authStyles.buttonDisabled]}
        onPress={handleSignIn}
        disabled={signingIn}
      >
        {signingIn ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={authStyles.primaryButtonText}>Sign in</Text>
        )}
      </Pressable>

      {error ? <Text style={authStyles.error}>{error}</Text> : null}

      <Link href="/sign-up" asChild>
        <Pressable style={authStyles.linkButton}>
          <Text style={authStyles.linkText}>
            Don&apos;t have an account? <Text style={authStyles.linkTextBold}>Sign up</Text>
          </Text>
        </Pressable>
      </Link>

      <StatusBar style="auto" />
    </View>
  );
}
