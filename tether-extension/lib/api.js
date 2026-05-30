import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../config.js";

const SESSION_KEY = "tether_session";

const IGNORED_URL_PREFIXES = ["chrome://", "chrome-extension://", "edge://", "about:"];

const IGNORED_HOST_SUFFIXES = ["supabase.co", "supabase.com"];

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Add Supabase credentials to config.js first.");
  }
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

  await chrome.storage.local.set({ [SESSION_KEY]: data });
  return data;
}

export async function signOut() {
  await chrome.storage.local.remove(SESSION_KEY);
}

export async function upsertActiveTab({ url, title }) {
  assertConfig();

  const session = await getSession();
  if (!session?.access_token || !session?.user?.id) {
    throw new Error("Not signed in. Open the extension popup and sign in first.");
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/active_tabs?on_conflict=user_id`,
    {
      method: "POST",
      headers: {
        ...authHeaders(session.access_token),
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        user_id: session.user.id,
        url,
        title,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Sync failed (${response.status})`);
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
