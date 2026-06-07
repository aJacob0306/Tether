import { getActiveBrowserTab, isTrackableUrl, syncTab } from "./lib/api.js";
import {
  closeIdleWorkSessionIfNeeded,
  closeOpenWorkSession,
  syncWorkSession,
} from "./lib/sessions.js";

const IDLE_CHECK_ALARM = "tether-idle-check";

async function syncActiveTab() {
  try {
    const tab = await getActiveBrowserTab();
    if (!tab?.url) {
      throw new Error("No active tab found.");
    }

    if (isTrackableUrl(tab.url)) {
      await syncTab(tab);
      console.log("[Tether] Synced:", tab.title, tab.url);
    }

    await syncWorkSession(tab);
    return tab;
  } catch (error) {
    console.log("[Tether] Sync skipped:", error.message);
    throw error;
  }
}

function setupIdleAlarm() {
  chrome.alarms.create(IDLE_CHECK_ALARM, { periodInMinutes: 2 });
}

chrome.tabs.onActivated.addListener(() => {
  syncActiveTab().catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url && !changeInfo.title) return;

  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab.active) return;
    syncActiveTab().catch(() => {});
  });
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    closeOpenWorkSession().catch(() => {});
    return;
  }

  syncActiveTab().catch(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== IDLE_CHECK_ALARM) return;
  closeIdleWorkSessionIfNeeded().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  setupIdleAlarm();
  syncActiveTab().catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  setupIdleAlarm();
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
