import { authHeadersForSession, authedRestRequest, supabaseUrl } from "./api.js";

const LAST_NOTIFY_AT_KEY = "tether_last_work_notify_at";
const NOTIFY_COOLDOWN_MS = 30 * 60 * 1000;

async function getLastNotifyAt() {
  const result = await chrome.storage.local.get(LAST_NOTIFY_AT_KEY);
  return result[LAST_NOTIFY_AT_KEY] ?? 0;
}

async function setLastNotifyAt(timestamp) {
  await chrome.storage.local.set({ [LAST_NOTIFY_AT_KEY]: timestamp });
}

export async function notifyPeersStartedWorking(domain) {
  const lastNotifyAt = await getLastNotifyAt();
  if (Date.now() - lastNotifyAt < NOTIFY_COOLDOWN_MS) {
    return { skipped: true, reason: "cooldown" };
  }

  const { response } = await authedRestRequest((session) =>
    fetch(`${supabaseUrl()}/functions/v1/send-work-started-push`, {
      method: "POST",
      headers: authHeadersForSession(session),
      body: JSON.stringify({ domain }),
    }),
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || `Notify failed (${response.status})`);
  }

  await setLastNotifyAt(Date.now());
  return result;
}
