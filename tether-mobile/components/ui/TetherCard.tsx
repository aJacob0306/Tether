import { Ionicons } from "@expo/vector-icons";
import { useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { colors, radius, spacing, typography } from "../../constants/theme";
import { Badge } from "./Badge";
import { Card } from "./Card";

type TetherCardProps = {
  name: string;
  memberCount: number;
  inviteCode: string;
  isActive?: boolean;
  isCreator?: boolean;
  onPress: () => void;
  onSetActive?: () => void;
  onLeaveOrDelete?: () => void;
};

const ACTION_BUTTON_WIDTH = 80;
const ACTION_BUTTON_GAP = spacing.sm;

/** Row card for a tether in the Home list with swipe actions. */
export function TetherCard({
  name,
  memberCount,
  inviteCode,
  isActive = false,
  isCreator = false,
  onPress,
  onSetActive,
  onLeaveOrDelete,
}: TetherCardProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const memberLabel = `${memberCount} ${memberCount === 1 ? "member" : "members"}`;
  const destructiveLabel = isCreator ? "Delete" : "Leave";
  const showActiveAction = Boolean(onSetActive && !isActive);
  const showDestructiveAction = Boolean(onLeaveOrDelete);
  const actionCount = Number(showActiveAction) + Number(showDestructiveAction);
  const actionsWidth =
    actionCount > 0
      ? actionCount * ACTION_BUTTON_WIDTH + actionCount * ACTION_BUTTON_GAP
      : 0;

  function closeSwipe() {
    swipeableRef.current?.close();
  }

  function renderRightActions(
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
  ) {
    if (actionsWidth <= 0) return null;

    const translateX = dragX.interpolate({
      inputRange: [-actionsWidth, 0],
      outputRange: [0, actionsWidth],
      extrapolate: "clamp",
    });

    return (
      <Animated.View
        style={[
          styles.actions,
          { width: actionsWidth, transform: [{ translateX }] },
        ]}
      >
        {showActiveAction ? (
          <Pressable
            onPress={() => {
              closeSwipe();
              onSetActive?.();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Set ${name} as active tether`}
            style={({ pressed }) => [
              styles.actionButton,
              styles.activeAction,
              pressed && styles.actionPressed,
            ]}
          >
            <Ionicons name="star" size={20} color={colors.textOnAccent} />
            <Text style={styles.actionLabel}>Active</Text>
          </Pressable>
        ) : null}

        {showDestructiveAction ? (
          <Pressable
            onPress={() => {
              closeSwipe();
              onLeaveOrDelete?.();
            }}
            accessibilityRole="button"
            accessibilityLabel={`${destructiveLabel} ${name}`}
            style={({ pressed }) => [
              styles.actionButton,
              styles.destructiveAction,
              pressed && styles.actionPressed,
            ]}
          >
            <Ionicons
              name={isCreator ? "trash-outline" : "exit-outline"}
              size={20}
              color={colors.textOnAccent}
            />
            <Text style={styles.actionLabel}>{destructiveLabel}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    );
  }

  return (
    <Swipeable
      ref={swipeableRef}
      friction={2}
      overshootRight={false}
      rightThreshold={40}
      renderRightActions={renderRightActions}
    >
      <Card
        onPress={onPress}
        accessibilityLabel={`${name}, ${memberLabel}${isActive ? ", active tether" : ""}`}
        accessibilityHint="Open tether board. Swipe left for more actions."
        style={[styles.row, isActive && styles.rowActive]}
      >
        <View style={[styles.avatar, isActive && styles.avatarActive]}>
          <Text style={[styles.avatarText, isActive && styles.avatarTextActive]}>
            {name.trim().charAt(0).toUpperCase() || "T"}
          </Text>
        </View>
        <View style={styles.body}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {isActive ? (
              <Badge label="Active" tone="success" icon="star" />
            ) : null}
          </View>
          <View style={styles.metaRow}>
            <Badge label={memberLabel} icon="people-outline" />
            <Badge label={inviteCode} icon="key-outline" tone="accent" />
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </Card>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  rowActive: {
    borderColor: colors.working,
    borderWidth: 2,
    backgroundColor: colors.workingSurface,
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
  avatarActive: {
    borderColor: colors.working,
    backgroundColor: colors.workingSurface,
  },
  avatarText: {
    ...typography.heading,
    color: colors.accentSoft,
  },
  avatarTextActive: {
    color: colors.workingSoft,
  },
  body: {
    flex: 1,
    gap: spacing.sm,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  name: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "flex-end",
  },
  actionButton: {
    width: ACTION_BUTTON_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radius.lg,
    marginLeft: ACTION_BUTTON_GAP,
  },
  activeAction: {
    backgroundColor: colors.working,
  },
  destructiveAction: {
    backgroundColor: colors.dangerStrong,
  },
  actionPressed: {
    opacity: 0.85,
  },
  actionLabel: {
    ...typography.caption,
    color: colors.textOnAccent,
    fontWeight: "700",
  },
});
