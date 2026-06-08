import { closeIdleWorkSessionIfNeeded, closeOpenWorkSession } from "./lib/sessions.js";
import { syncActiveTab } from "./lib/sync.js";

const IDLE_CHECK_ALARM = "tether-idle-check";
const SYNC_HEARTBEAT_ALARM = "tether-sync-heartbeat";

function logSyncFailure(error) {
  console.log("[Tether] Sync skipped:", error.message);
}

function setupAlarms() {
  chrome.alarms.create(IDLE_CHECK_ALARM, { periodInMinutes: 2 });
  chrome.alarms.create(SYNC_HEARTBEAT_ALARM, { periodInMinutes: 1 });
}

function syncAndLog() {
  syncActiveTab()
    .then((result) => {
      if (result.trackable) {
        console.log("[Tether] Synced:", result.title, result.url);
      }
    })
    .catch(logSyncFailure);
}

chrome.tabs.onActivated.addListener(() => {
  syncAndLog();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url && !changeInfo.title) return;

  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab.active) return;
    syncAndLog();
  });
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    closeOpenWorkSession().catch(() => {});
    return;
  }

  syncAndLog();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === IDLE_CHECK_ALARM) {
    closeIdleWorkSessionIfNeeded().catch((error) => {
      console.log("[Tether] Idle check failed:", error.message);
    });
    return;
  }

  if (alarm.name === SYNC_HEARTBEAT_ALARM) {
    syncAndLog();
  }
});

chrome.runtime.onStartup.addListener(() => {
  setupAlarms();
  syncAndLog();
});

chrome.runtime.onInstalled.addListener(() => {
  setupAlarms();
  syncAndLog();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "SYNC_NOW") return;

  syncActiveTab()
    .then((result) =>
      sendResponse({
        ok: true,
        title: result.title,
        url: result.url,
      }),
    )
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

setupAlarms();
