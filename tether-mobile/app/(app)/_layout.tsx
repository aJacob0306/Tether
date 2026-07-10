import { Stack } from "expo-router";

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="create" />
      <Stack.Screen name="join" />
      <Stack.Screen name="companion" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="me" />
      <Stack.Screen name="tether/[id]" />
      <Stack.Screen name="tether/[id]/settings" />
      <Stack.Screen name="tether/[id]/member/[userId]" />
    </Stack>
  );
}
