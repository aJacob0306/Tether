import {
  closeWorkSession,
  isTrackableUrl,
  parseDomain,
  startWorkSession,
  updateWorkSessionTab,
} from "./api.js";

const IDLE_MS = 15 * 60 * 1000;
const SESSION_STATE_KEY = "tether_work_session_state";

const EMPTY_STATE = {
  openSessionId: null,
  openSessionDomain: null,
  lastSyncAt: null,
};

async function loadSessionState() {
  const result = await chrome.storage.local.get(SESSION_STATE_KEY);
  return { ...EMPTY_STATE, ...(result[SESSION_STATE_KEY] ?? {}) };
}

async function saveSessionState(state) {
  await chrome.storage.local.set({ [SESSION_STATE_KEY]: state });
}

async function clearSessionState() {
  await chrome.storage.local.remove(SESSION_STATE_KEY);
}

function msSince(isoTimestamp) {
  if (!isoTimestamp) return Infinity;
  return Date.now() - new Date(isoTimestamp).getTime();
}

async function closeStoredSession(state) {
  if (!state.openSessionId) return;

  try {
    await closeWorkSession(state.openSessionId);
  } catch (error) {
    console.log("[Tether] Session close failed:", error.message);
  }
}

export async function syncWorkSession(tab) {
  if (!tab?.url) return;

  let state = await loadSessionState();

  if (!isTrackableUrl(tab.url)) {
    await closeStoredSession(state);
    await clearSessionState();
    return;
  }

  const domain = parseDomain(tab.url);
  if (!domain) {
    await closeStoredSession(state);
    await clearSessionState();
    return;
  }

  const url = tab.url;
  const title = tab.title ?? "";
  const nowIso = new Date().toISOString();

  try {
    if (state.openSessionId && msSince(state.lastSyncAt) > IDLE_MS) {
      await closeWorkSession(state.openSessionId);
      state = { ...EMPTY_STATE };
    }

    if (!state.openSessionId) {
      const session = await startWorkSession({ domain, url, title });
      await saveSessionState({
        openSessionId: session.id,
        openSessionDomain: domain,
        lastSyncAt: nowIso,
      });
      return;
    }

    if (state.openSessionDomain === domain) {
      await updateWorkSessionTab(state.openSessionId, { url, title });
      await saveSessionState({
        ...state,
        lastSyncAt: nowIso,
      });
      return;
    }

    await closeWorkSession(state.openSessionId);
    const session = await startWorkSession({ domain, url, title });
    await saveSessionState({
      openSessionId: session.id,
      openSessionDomain: domain,
      lastSyncAt: nowIso,
    });
  } catch (error) {
    console.log("[Tether] Session sync failed:", error.message);
    await clearSessionState();
  }
}

export async function closeIdleWorkSessionIfNeeded() {
  const state = await loadSessionState();
  if (!state.openSessionId || msSince(state.lastSyncAt) <= IDLE_MS) return;

  await closeStoredSession(state);
  await clearSessionState();
}

export async function closeOpenWorkSession() {
  const state = await loadSessionState();
  await closeStoredSession(state);
  await clearSessionState();
}
