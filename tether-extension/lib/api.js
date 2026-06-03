import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../config.js";

const SESSION_KEY = "tether_session";
const REFRESH_BUFFER_SECONDS = 60;

const IGNORED_URL_PREFIXES = ["chrome://", "chrome-extension://", "edge://", "about:"];

const IGNORED_HOST_SUFFIXES = ["supabase.co", "supabase.com"];

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Add Supabase credentials to config.js first.");
  }
}

function normalizeSession(data) {
  if (data.expires_in && !data.expires_at) {
    data.expires_at = Math.floor(Date.now() / 1000) + data.expires_in;
  }
  return data;
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
  };
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
  assertConfig();

  if (!session?.refresh_token) {
    throw new Error("Session expired. Open the extension popup and sign in again.");
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });

  const data = await response.json();
  if (!response.ok) {
    await signOut();
    throw new Error(data.error_description || data.msg || "Session expired. Sign in again.");
  }

  const nextSession = normalizeSession(data);
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

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();
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
