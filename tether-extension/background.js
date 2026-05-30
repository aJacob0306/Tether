import { isTrackableUrl, syncCurrentTab } from "./lib/api.js";

async function syncActiveTab() {
  try {
    const tab = await syncCurrentTab();
    console.log("[Tether] Synced:", tab.title, tab.url);
    return tab;
  } catch (error) {
    console.log("[Tether] Sync skipped:", error.message);
    throw error;
  }
}

chrome.tabs.onActivated.addListener(() => {
  syncActiveTab().catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url && !changeInfo.title) return;

  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab.active || !isTrackableUrl(tab.url)) return;
    syncActiveTab().catch(() => {});
  });
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  syncActiveTab().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  syncActiveTab().catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  syncActiveTab().catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "SYNC_NOW") return;

  syncActiveTab()
    .then((tab) =>
      sendResponse({
        ok: true,
        title: tab.title ?? "",
        url: tab.url ?? "",
      }),
    )
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
