import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../constants/theme";

type IoniconName = keyof typeof Ionicons.glyphMap;

export type ConnectionStatus = "connected" | "waiting" | "disconnected" | "checking";

type ConnectionStatusCardProps = {
  title: string;
  status: ConnectionStatus;
  description?: string;
};

const STATUS_META: Record<
  ConnectionStatus,
  { label: string; icon: IoniconName; color: string }
> = {
  connected: { label: "Connected", icon: "checkmark-circle", color: colors.workingSoft },
  waiting: { label: "Waiting", icon: "time-outline", color: colors.idleSoft },
  disconnected: { label: "Not connected", icon: "ellipse-outline", color: colors.offline },
  checking: { label: "Checking", icon: "sync-outline", color: colors.accentSoft },
};

/**
 * Shows the live connection state of a companion/extension with an icon, text
 * label, and color — never color alone.
 */
export function ConnectionStatusCard({
  title,
  status,
  description,
}: ConnectionStatusCardProps) {
  const meta = STATUS_META[status];

  return (
    <View
      style={styles.card}
      accessibilityLabel={`${title}: ${meta.label}${description ? `. ${description}` : ""}`}
    >
      <View style={styles.row}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.status}>
          {status === "checking" ? (
            <ActivityIndicator size="small" color={meta.color} />
          ) : (
            <Ionicons name={meta.icon} size={16} color={meta.color} />
          )}
          <Text style={[styles.statusLabel, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flex: 1,
  },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  statusLabel: {
    ...typography.label,
  },
  description: {
    ...typography.subhead,
    color: colors.textSecondary,
  },
});
