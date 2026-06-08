import {
  closeWorkSession,
  getOpenWorkSession,
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

function isUniqueOpenSessionError(error) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    message.includes("23505") ||
    message.includes("duplicate key") ||
    message.includes("work_sessions_one_open_per_user_idx")
  );
}

function stateFromSession(session, lastSyncAt) {
  return {
    openSessionId: session.id,
    openSessionDomain: session.domain,
    lastSyncAt,
  };
}

async function closeStoredSession(state) {
  if (!state.openSessionId) return;

  try {
    await closeWorkSession(state.openSessionId);
  } catch (error) {
    console.log("[Tether] Session close failed:", error.message);
  }
}

async function loadOpenSessionState(nowIso) {
  const existing = await getOpenWorkSession();
  return existing?.id ? stateFromSession(existing, nowIso) : { ...EMPTY_STATE };
}

async function startSessionState({ domain, url, title, nowIso }) {
  try {
    const session = await startWorkSession({ domain, url, title });
    if (!session?.id) {
      throw new Error("Failed to start work session.");
    }
    return stateFromSession(session, nowIso);
  } catch (error) {
    if (!isUniqueOpenSessionError(error)) throw error;

    const existing = await getOpenWorkSession();
    if (existing?.id) {
      return stateFromSession(existing, nowIso);
    }

    throw error;
  }
}

async function saveAndReturnState(state) {
  await saveSessionState(state);
  return state;
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
      state = await loadOpenSessionState(nowIso);
    }

    if (!state.openSessionId) {
      await saveAndReturnState(await startSessionState({ domain, url, title, nowIso }));
      return;
    }

    if (state.openSessionDomain === domain) {
      const updated = await updateWorkSessionTab(state.openSessionId, { url, title });
      if (!updated?.id) {
        state = await loadOpenSessionState(nowIso);
        if (!state.openSessionId) {
          state = await startSessionState({ domain, url, title, nowIso });
        } else if (state.openSessionDomain !== domain) {
          await closeWorkSession(state.openSessionId);
          state = await startSessionState({ domain, url, title, nowIso });
        } else {
          await updateWorkSessionTab(state.openSessionId, { url, title });
        }
      }

      await saveSessionState({
        ...state,
        lastSyncAt: nowIso,
      });
      return;
    }

    await closeWorkSession(state.openSessionId);
    await saveAndReturnState(await startSessionState({ domain, url, title, nowIso }));
  } catch (error) {
    console.log("[Tether] Session sync failed:", error.message);
    try {
      const recoveredState = await loadOpenSessionState(nowIso);
      if (recoveredState.openSessionId) {
        await saveSessionState(recoveredState);
      }
    } catch (recoveryError) {
      console.log("[Tether] Session recovery failed:", recoveryError.message);
    }
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
