import {
  SUPABASE_ANON_KEY as RAW_SUPABASE_ANON_KEY,
  SUPABASE_URL as RAW_SUPABASE_URL,
} from "../config.js";

const SUPABASE_URL = RAW_SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
const SUPABASE_ANON_KEY = RAW_SUPABASE_ANON_KEY?.trim() ?? "";

const SESSION_KEY = "tether_session";
const REFRESH_BUFFER_SECONDS = 60;
let refreshSessionPromise = null;

const IGNORED_URL_PREFIXES = ["chrome://", "chrome-extension://", "edge://", "about:"];

const IGNORED_HOST_SUFFIXES = ["supabase.co", "supabase.com"];

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Add Supabase credentials to config.js first.");
  }

  if (!SUPABASE_URL.startsWith("https://") || !SUPABASE_URL.includes("supabase.")) {
    throw new Error("SUPABASE_URL in config.js must look like https://your-ref.supabase.co");
  }

  if (
    !SUPABASE_ANON_KEY.startsWith("sb_publishable_") &&
    !SUPABASE_ANON_KEY.startsWith("eyJ")
  ) {
    throw new Error(
      "SUPABASE_ANON_KEY looks wrong. Copy the publishable (anon) key from Supabase → Project Settings → API. It should start with sb_publishable_ or eyJ.",
    );
  }
}

function normalizeSession(data) {
  if (data.expires_in && !data.expires_at) {
    data.expires_at = Math.floor(Date.now() / 1000) + data.expires_in;
  }
  return data;
}

function mergeRefreshedSession(previousSession, refreshData) {
  const refreshedSession = normalizeSession({ ...refreshData });
  return {
    ...previousSession,
    ...refreshedSession,
    refresh_token: refreshedSession.refresh_token ?? previousSession.refresh_token,
    user: refreshedSession.user ?? previousSession.user,
  };
}

function isSessionExpired(session) {
  if (!session?.expires_at) return Boolean(session?.refresh_token);
  return Date.now() / 1000 >= session.expires_at - REFRESH_BUFFER_SECONDS;
}

async function readError(response) {
  const errorText = await response.text();
  if (!errorText) return { message: `Sync failed (${response.status})` };

  try {
    const errorJson = JSON.parse(errorText);
    return {
      code: errorJson.code,
      message: errorJson.message || errorJson.error_description || errorJson.msg || errorText,
      raw: errorText,
    };
  } catch {
    return { message: errorText, raw: errorText };
  }
}

function isExpiredJwtError(response, error) {
  return (
    response.status === 401 ||
    error.code === "PGRST303" ||
    error.message?.toLowerCase().includes("jwt expired")
  );
}

function authHeaders(accessToken) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "X-Supabase-Api-Version": "2024-01-01",
  };
}

export function authHeadersForSession(session) {
  return authHeaders(session.access_token);
}

export function supabaseUrl() {
  assertConfig();
  return SUPABASE_URL;
}

function anonAuthHeaders() {
  return authHeaders(SUPABASE_ANON_KEY);
}

function networkErrorMessage() {
  return `Could not reach Supabase at ${SUPABASE_URL}. Check config.js (Project Settings → API), your internet connection, and that the project is not paused.`;
}

export async function checkSupabaseReachable() {
  assertConfig();

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function authedRestRequest(send) {
  assertConfig();

  let session = await getValidSession();
  if (!session?.access_token || !session?.user?.id) {
    throw new Error("Not signed in. Open the extension popup and sign in first.");
  }

  let response = await send(session);
  let error = response.ok ? null : await readError(response);

  if (error && isExpiredJwtError(response, error) && session.refresh_token) {
    session = await refreshSession(session);
    response = await send(session);
    error = response.ok ? null : await readError(response);
  }

  if (!response.ok) {
    throw new Error(error?.raw || error?.message || `Request failed (${response.status})`);
  }

  return { session, response };
}

export function parseDomain(url) {
  if (!url) return null;

  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function isTrackableUrl(url) {
  if (!url) return false;
  if (IGNORED_URL_PREFIXES.some((prefix) => url.startsWith(prefix))) return false;

  try {
    const { hostname } = new URL(url);
    if (IGNORED_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

export async function getSession() {
  const result = await chrome.storage.local.get(SESSION_KEY);
  return result[SESSION_KEY] ?? null;
}

async function saveSession(session) {
  await chrome.storage.local.set({ [SESSION_KEY]: session });
}

export async function refreshSession(session) {
  if (refreshSessionPromise) return refreshSessionPromise;

  refreshSessionPromise = refreshSessionOnce(session).finally(() => {
    refreshSessionPromise = null;
  });

  return refreshSessionPromise;
}

async function refreshSessionOnce(session) {
  assertConfig();

  if (!session?.refresh_token) {
    throw new Error("Session expired. Open the extension popup and sign in again.");
  }

  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: anonAuthHeaders(),
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
  } catch {
    throw new Error(networkErrorMessage());
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Unexpected response from Supabase while refreshing session.");
  }
  if (!response.ok) {
    await signOut();
    throw new Error(data.error_description || data.msg || "Session expired. Sign in again.");
  }

  const nextSession = mergeRefreshedSession(session, data);
  await saveSession(nextSession);
  return nextSession;
}

export async function getValidSession() {
  let session = await getSession();
  if (!session?.access_token) return null;

  if (isSessionExpired(session)) {
    session = await refreshSession(session);
  }

  return session;
}

export async function signIn(email, password) {
  assertConfig();

  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: anonAuthHeaders(),
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error(networkErrorMessage());
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Unexpected response from Supabase while signing in.");
  }

  if (!response.ok) {
    throw new Error(data.error_description || data.msg || "Sign in failed");
  }

  const session = normalizeSession(data);
  await saveSession(session);
  return session;
}

export async function signOut() {
  await chrome.storage.local.remove(SESSION_KEY);
}

export async function upsertActiveTab({ url, title }) {
  assertConfig();

  let session = await getValidSession();
  if (!session?.access_token || !session?.user?.id) {
    throw new Error("Not signed in. Open the extension popup and sign in first.");
  }

  async function send(accessToken) {
    return fetch(`${SUPABASE_URL}/rest/v1/active_tabs?on_conflict=user_id`, {
      method: "POST",
      headers: {
        ...authHeaders(accessToken),
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        user_id: session.user.id,
        url,
        title,
        updated_at: new Date().toISOString(),
      }),
    });
  }

  let response = await send(session.access_token);
  let error = response.ok ? null : await readError(response);

  if (error && isExpiredJwtError(response, error) && session.refresh_token) {
    session = await refreshSession(session);
    response = await send(session.access_token);
    error = response.ok ? null : await readError(response);
  }

  if (!response.ok) {
    throw new Error(error?.raw || error?.message || `Sync failed (${response.status})`);
  }
}

export async function clearActiveTab() {
  const { session } = await authedRestRequest((authSession) =>
    fetch(`${SUPABASE_URL}/rest/v1/active_tabs?user_id=eq.${authSession.user.id}`, {
      method: "DELETE",
      headers: authHeaders(authSession.access_token),
    }),
  );

  return session;
}

export async function getOpenWorkSession() {
  const { session, response } = await authedRestRequest((authSession) =>
    fetch(
      `${SUPABASE_URL}/rest/v1/work_sessions?user_id=eq.${authSession.user.id}&ended_at=is.null&select=id,domain,url,title,started_at,updated_at,ended_at&limit=1`,
      { headers: authHeaders(authSession.access_token) },
    ),
  );

  const rows = await response.json();
  return rows[0] ?? null;
}

export async function startWorkSession({ domain, url, title }) {
  const { session, response } = await authedRestRequest((authSession) =>
    fetch(`${SUPABASE_URL}/rest/v1/work_sessions`, {
      method: "POST",
      headers: {
        ...authHeaders(authSession.access_token),
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        user_id: authSession.user.id,
        domain,
        url,
        title,
      }),
    }),
  );

  const rows = await response.json();
  return rows[0] ?? null;
}

export async function closeWorkSession(sessionId, endedAt) {
  const ended_at = endedAt ?? new Date().toISOString();

  await authedRestRequest((authSession) =>
    fetch(`${SUPABASE_URL}/rest/v1/work_sessions?id=eq.${encodeURIComponent(sessionId)}`, {
      method: "PATCH",
      headers: {
        ...authHeaders(authSession.access_token),
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ ended_at }),
    }),
  );
}

export async function updateWorkSessionTab(sessionId, { url, title }) {
  const { response } = await authedRestRequest((authSession) =>
    fetch(
      `${SUPABASE_URL}/rest/v1/work_sessions?id=eq.${encodeURIComponent(sessionId)}&select=id,domain,url,title,started_at,ended_at`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(authSession.access_token),
          Prefer: "return=representation",
        },
        body: JSON.stringify({ url, title }),
      },
    ),
  );

  const rows = await response.json();
  return rows[0] ?? null;
}

export async function isChromeFocused() {
  try {
    const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
    return win?.focused === true;
  } catch {
    return false;
  }
}

export async function getActiveBrowserTab() {
  const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
  if (win?.id != null) {
    const tabs = await chrome.tabs.query({ active: true, windowId: win.id });
    if (tabs[0]) return tabs[0];
  }

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab ?? null;
}

export async function syncTab(tab) {
  if (!tab?.url) {
    throw new Error("No active tab found.");
  }

  if (!isTrackableUrl(tab.url)) {
    throw new Error(
      "This tab is not synced (browser internal pages and Supabase dashboard are skipped). Switch to a normal website tab.",
    );
  }

  await upsertActiveTab({
    url: tab.url,
    title: tab.title ?? "",
  });

  return tab;
}

export async function syncCurrentTab() {
  const tab = await getActiveBrowserTab();
  return syncTab(tab);
}

export async function closeStaleOpenWorkSessions(staleMinutes = 15) {
  await authedRestRequest((authSession) =>
    fetch(`${SUPABASE_URL}/rest/v1/rpc/close_stale_open_work_sessions`, {
      method: "POST",
      headers: {
        ...authHeaders(authSession.access_token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_stale_minutes: staleMinutes }),
    }),
  );
}
