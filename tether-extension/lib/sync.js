import { getAllowlist, urlMatchesAllowlist } from "./allowlist.js";
import { clearActiveTab, getActiveBrowserTab, isTrackableUrl, syncTab } from "./api.js";
import { isIdleState, queryIdleState } from "./idle.js";
import { closeOpenWorkSession, closeTrackingForIdle, syncWorkSession } from "./sessions.js";

export { IDLE_DETECTION_SECONDS, isIdleState, queryIdleState } from "./idle.js";

let activeSyncPromise = null;

async function syncActiveTabOnce() {
  const idleState = await queryIdleState();
  if (isIdleState(idleState)) {
    await closeTrackingForIdle().catch(() => {});

    return {
      tab: null,
      trackable: false,
      allowed: false,
      hasAllowlist: false,
      synced: false,
      idleState,
      title: "",
      url: "",
    };
  }

  const tab = await getActiveBrowserTab();
  if (!tab?.url) {
    throw new Error("No active tab found.");
  }

  const trackable = isTrackableUrl(tab.url);
  const allowlist = await getAllowlist();
  const hasAllowlist = allowlist.domains.length > 0;
  const allowed = trackable && hasAllowlist && urlMatchesAllowlist(tab.url, allowlist.domains);
  let synced = false;

  if (allowed) {
    await syncTab(tab);
    await syncWorkSession(tab);
    synced = true;
  } else {
    await Promise.all([
      closeOpenWorkSession().catch(() => {}),
      clearActiveTab().catch(() => {}),
    ]);
  }

  return {
    tab,
    trackable,
    allowed,
    hasAllowlist,
    synced,
    idleState,
    title: tab.title ?? "",
    url: tab.url ?? "",
  };
}

export async function syncActiveTab() {
  if (activeSyncPromise) return activeSyncPromise;

  activeSyncPromise = syncActiveTabOnce().finally(() => {
    activeSyncPromise = null;
  });

  return activeSyncPromise;
}
