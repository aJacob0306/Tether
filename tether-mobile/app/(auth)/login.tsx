import { Link } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppScreen, Button, TextInputField } from "../../components/ui";
import { colors, radius, spacing, typography } from "../../constants/theme";
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
    <AppScreen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>T</Text>
            </View>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>
              Sign in to see who in your crew is working and stay accountable together.
            </Text>
          </View>

          <TextInputField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            textContentType="emailAddress"
          />

          <TextInputField
            label="Password"
            value={password}
            onChangeText={setPassword}
            autoComplete="password"
            secureTextEntry
            placeholder="Your password"
            textContentType="password"
          />

          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

          <Button
            label="Sign in"
            onPress={handleSignIn}
            loading={signingIn}
            style={styles.submit}
          />

          <Link href="/sign-up" asChild>
            <Pressable
              style={styles.switchLink}
              accessibilityRole="link"
              accessibilityLabel="Create a new account"
            >
              <Text style={styles.switchText}>
                Don&apos;t have an account?{" "}
                <Text style={styles.switchTextBold}>Sign up</Text>
              </Text>
            </Pressable>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: spacing.xxl,
  },
  hero: {
    alignItems: "center",
    marginBottom: spacing.xxl,
  },
  brandMark: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  brandMarkText: {
    ...typography.display,
    color: colors.accentSoft,
  },
  title: {
    ...typography.display,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  subtitle: {
    ...typography.subhead,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 320,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  submit: {
    marginTop: spacing.sm,
  },
  switchLink: {
    marginTop: spacing.xl,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  switchText: {
    ...typography.subhead,
    color: colors.textSecondary,
  },
  switchTextBold: {
    color: colors.accentSoft,
    fontWeight: "700",
  },
});
