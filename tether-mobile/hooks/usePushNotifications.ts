import { useEffect } from "react";
import { setupPushNotificationsForUser } from "../lib/push-notifications";

export function usePushNotifications(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;

    setupPushNotificationsForUser().catch((error) => {
      console.warn("[Tether] Push setup failed:", error.message);
    });
  }, [userId]);
}
