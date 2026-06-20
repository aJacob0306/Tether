import { Link, useRouter } from "expo-router";
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
      options: { data: { display_name: trimmedName } },
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

    router.replace({ pathname: "/check-email", params: { email: trimmedEmail } });
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
            <Text style={styles.title}>Create your account</Text>
            <Text style={styles.subtitle}>
              Join Tether and turn focused work into shared momentum with your group.
            </Text>
          </View>

          <TextInputField
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
            autoComplete="name"
            placeholder="Alex"
            textContentType="name"
          />

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
            autoComplete="new-password"
            secureTextEntry
            placeholder="At least 6 characters"
            hint="Use at least 6 characters."
            textContentType="newPassword"
          />

          <TextInputField
            label="Confirm password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            autoComplete="new-password"
            secureTextEntry
            placeholder="Repeat password"
            textContentType="newPassword"
          />

          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

          <Button
            label="Create account"
            onPress={handleSignUp}
            loading={signingUp}
            style={styles.submit}
          />

          <Link href="/login" asChild>
            <Pressable
              style={styles.switchLink}
              accessibilityRole="link"
              accessibilityLabel="Sign in to an existing account"
            >
              <Text style={styles.switchText}>
                Already have an account?{" "}
                <Text style={styles.switchTextBold}>Sign in</Text>
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
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.display,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.subhead,
    color: colors.textSecondary,
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
