import { Link, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authStyles } from "../../constants/styles";

export default function CheckEmailScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();

  return (
    <SafeAreaView style={authStyles.container} edges={["top", "bottom", "left", "right"]}>
      <Text style={authStyles.title}>Check your email</Text>
      <Text style={authStyles.subtitle}>
        We sent a confirmation link{email ? ` to ${email}` : ""}. Open it to activate your account,
        then sign in.
      </Text>

      <Link href="/login" asChild>
        <Pressable style={authStyles.primaryButton}>
          <Text style={authStyles.primaryButtonText}>Back to sign in</Text>
        </Pressable>
      </Link>

      <StatusBar style="auto" />
    </SafeAreaView>
  );
}
