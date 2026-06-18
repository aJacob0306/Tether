import { refreshAllowlist } from "./lib/allowlist.js";
import { clearActiveTab, closeStaleOpenWorkSessions } from "./lib/api.js";
import {
  closeIdleWorkSessionIfNeeded,
  closeOpenWorkSession,
  closeTrackingForIdle,
} from "./lib/sessions.js";
import { IDLE_DETECTION_SECONDS, isIdleState } from "./lib/idle.js";
import { syncActiveTab } from "./lib/sync.js";

const IDLE_CHECK_ALARM = "tether-idle-check";
const SYNC_HEARTBEAT_ALARM = "tether-sync-heartbeat";
const ALLOWLIST_REFRESH_ALARM = "tether-allowlist-refresh";

function logSyncFailure(error) {
  console.log("[Tether] Sync skipped:", error.message);
}

function setupAlarms() {
  chrome.alarms.create(IDLE_CHECK_ALARM, { periodInMinutes: 2 });
  chrome.alarms.create(SYNC_HEARTBEAT_ALARM, { periodInMinutes: 1 });
  chrome.alarms.create(ALLOWLIST_REFRESH_ALARM, { periodInMinutes: 5 });
}

function syncAndLog() {
  syncActiveTab()
    .then((result) => {
      if (result.synced) {
        console.log("[Tether] Synced:", result.title, result.url);
      } else if (isIdleState(result.idleState)) {
        console.log("[Tether] Sync skipped: browser is idle or locked.");
      } else if (result.trackable && !result.hasAllowlist) {
        console.log("[Tether] Sync skipped: no allowlist configured in mobile app.");
      } else if (result.trackable && !result.allowed) {
        console.log("[Tether] Sync skipped: tab not on allowlist.", result.url);
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
    Promise.all([
      closeOpenWorkSession().catch(() => {}),
      clearActiveTab().catch(() => {}),
    ]).catch((error) => {
      console.log("[Tether] Focus loss close failed:", error.message);
    });
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

  if (alarm.name === ALLOWLIST_REFRESH_ALARM) {
    refreshAllowlist({ force: true }).catch((error) => {
      console.log("[Tether] Allowlist refresh failed:", error.message);
    });
    return;
  }

  if (alarm.name === SYNC_HEARTBEAT_ALARM) {
    syncAndLog();
  }
});

function closeForIdleState(state) {
  if (!isIdleState(state)) return;

  closeTrackingForIdle().catch((error) => {
    console.log("[Tether] Idle close failed:", error.message);
  });
}

function setupIdleDetection() {
  if (!chrome.idle) return;

  chrome.idle.setDetectionInterval(IDLE_DETECTION_SECONDS);
  chrome.idle.onStateChanged.addListener(closeForIdleState);
}

function setupSuspendHandler() {
  if (!chrome.runtime.onSuspend) return;

  chrome.runtime.onSuspend.addListener(() => {
    closeTrackingForIdle().catch((error) => {
      console.log("[Tether] Suspend close failed:", error.message);
    });
  });
}

async function startup() {
  setupAlarms();
  setupIdleDetection();
  setupSuspendHandler();
  refreshAllowlist({ force: true }).catch(() => {});

  try {
    await closeStaleOpenWorkSessions();
  } catch (error) {
    console.log("[Tether] Stale session cleanup failed:", error.message);
  }

  syncAndLog();
}

chrome.runtime.onStartup.addListener(startup);

chrome.runtime.onInstalled.addListener(startup);

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

startup();
