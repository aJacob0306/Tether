import { getActiveBrowserTab, isTrackableUrl, syncTab } from "./api.js";
import { syncWorkSession } from "./sessions.js";

let activeSyncPromise = null;

async function syncActiveTabOnce() {
  const tab = await getActiveBrowserTab();
  if (!tab?.url) {
    throw new Error("No active tab found.");
  }

  const trackable = isTrackableUrl(tab.url);
  if (trackable) {
    await syncTab(tab);
  }

  await syncWorkSession(tab);

  return {
    tab,
    trackable,
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
