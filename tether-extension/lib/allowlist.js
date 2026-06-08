import { authedRestRequest, authHeadersForSession, parseDomain, supabaseUrl } from "./api.js";

const ALLOWLIST_CACHE_KEY = "tether_allowed_targets_cache";
const ALLOWLIST_FETCHED_AT_KEY = "tether_allowed_targets_fetched_at";
const CACHE_TTL_MS = 5 * 60 * 1000;

const EMPTY_CACHE = {
  domains: [],
  apps: [],
};

function normalizeDomain(value) {
  const trimmed = (value ?? "").trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.startsWith("www.") ? trimmed.slice(4) : trimmed;
}

function splitTargets(rows) {
  const domains = new Set();
  const apps = new Set();

  for (const row of rows ?? []) {
    if (row.target_type === "domain") {
      const domain = normalizeDomain(row.value);
      if (domain) domains.add(domain);
    } else if (row.target_type === "app") {
      const app = (row.value ?? "").trim();
      if (app) apps.add(app);
    }
  }

  return {
    domains: [...domains],
    apps: [...apps],
  };
}

async function loadCachedAllowlist() {
  const result = await chrome.storage.local.get([
    ALLOWLIST_CACHE_KEY,
    ALLOWLIST_FETCHED_AT_KEY,
  ]);

  return {
    cache: { ...EMPTY_CACHE, ...(result[ALLOWLIST_CACHE_KEY] ?? {}) },
    fetchedAt: result[ALLOWLIST_FETCHED_AT_KEY] ?? 0,
  };
}

async function saveCachedAllowlist(cache) {
  await chrome.storage.local.set({
    [ALLOWLIST_CACHE_KEY]: cache,
    [ALLOWLIST_FETCHED_AT_KEY]: Date.now(),
  });
}

export async function refreshAllowlist({ force = false } = {}) {
  const { cache, fetchedAt } = await loadCachedAllowlist();
  if (!force && Date.now() - fetchedAt < CACHE_TTL_MS) {
    return cache;
  }

  try {
    const { response } = await authedRestRequest((session) =>
      fetch(`${supabaseUrl()}/rest/v1/rpc/get_my_allowed_targets`, {
        method: "POST",
        headers: authHeadersForSession(session),
        body: "{}",
      }),
    );

    const rows = await response.json();
    const nextCache = splitTargets(rows);
    await saveCachedAllowlist(nextCache);
    return nextCache;
  } catch (error) {
    if (cache.domains.length || cache.apps.length) {
      return cache;
    }
    throw error;
  }
}

export async function getAllowlist() {
  return refreshAllowlist();
}

export function domainMatchesAllowlist(hostname, domains) {
  const normalizedHost = normalizeDomain(hostname);
  if (!normalizedHost) return false;

  return domains.some((domain) => {
    const normalizedDomain = normalizeDomain(domain);
    return (
      normalizedHost === normalizedDomain ||
      normalizedHost.endsWith(`.${normalizedDomain}`)
    );
  });
}

export function urlMatchesAllowlist(url, domains) {
  const domain = parseDomain(url);
  if (!domain) return false;
  return domainMatchesAllowlist(domain, domains);
}

export async function isUrlAllowed(url) {
  const { domains } = await getAllowlist();
  if (!domains.length) return false;
  return urlMatchesAllowlist(url, domains);
}

export async function clearAllowlistCache() {
  await chrome.storage.local.remove([ALLOWLIST_CACHE_KEY, ALLOWLIST_FETCHED_AT_KEY]);
}
