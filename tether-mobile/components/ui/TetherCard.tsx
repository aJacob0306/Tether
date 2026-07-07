import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../constants/theme";
import { Badge } from "./Badge";
import { Card } from "./Card";

type TetherCardProps = {
  name: string;
  memberCount: number;
  inviteCode: string;
  onPress: () => void;
};

/** Row card for a tether in the Home list: avatar, name, and key metadata. */
export function TetherCard({ name, memberCount, inviteCode, onPress }: TetherCardProps) {
  const memberLabel = `${memberCount} ${memberCount === 1 ? "member" : "members"}`;

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${name}, ${memberLabel}`}
      accessibilityHint="Open tether board"
      style={styles.row}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{name.trim().charAt(0).toUpperCase() || "T"}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.metaRow}>
          <Badge label={memberLabel} icon="people-outline" />
          <Badge label={inviteCode} icon="key-outline" tone="accent" />
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    ...typography.heading,
    color: colors.accentSoft,
  },
  body: {
    flex: 1,
    gap: spacing.sm,
  },
  name: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
});
