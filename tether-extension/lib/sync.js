import {
  getAllowlist,
  resolveDomainTetherId,
  urlMatchesAllowlist,
} from "./allowlist.js";
import {
  getActiveBrowserTab,
  isChromeFocused,
  isTrackableUrl,
  syncTab,
} from "./api.js";
import { isIdleState, queryIdleState } from "./idle.js";
import {
  closeTrackingForBackground,
  closeTrackingForIdle,
  syncWorkSession,
} from "./sessions.js";

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

  const focused = await isChromeFocused();
  if (!focused) {
    await closeTrackingForBackground().catch(() => {});

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
  const matchesAllowlist =
    trackable && hasAllowlist && urlMatchesAllowlist(tab.url, allowlist.domains);
  const tetherId = matchesAllowlist ? resolveDomainTetherId(tab.url, allowlist) : null;
  const allowed = Boolean(matchesAllowlist && tetherId);
  let synced = false;

  if (allowed) {
    await syncTab(tab);
    await syncWorkSession(tab, tetherId);
    synced = true;
  } else {
    await closeTrackingForBackground().catch(() => {});
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
