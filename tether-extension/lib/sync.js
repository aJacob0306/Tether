import { getAllowlist, urlMatchesAllowlist } from "./allowlist.js";
import { clearActiveTab, getActiveBrowserTab, isTrackableUrl, syncTab } from "./api.js";
import { closeOpenWorkSession, syncWorkSession } from "./sessions.js";

let activeSyncPromise = null;

async function syncActiveTabOnce() {
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
