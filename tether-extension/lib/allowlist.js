import { authedRestRequest, authHeadersForSession, parseDomain, supabaseUrl } from "./api.js";

const ALLOWLIST_CACHE_KEY = "tether_allowed_targets_cache";
const ALLOWLIST_FETCHED_AT_KEY = "tether_allowed_targets_fetched_at";
const ACTIVE_TETHER_CACHE_KEY = "tether_active_tether_id";
const CACHE_TTL_MS = 5 * 60 * 1000;

const EMPTY_CACHE = {
  domains: [],
  apps: [],
  entries: [],
  activeTetherId: null,
};

function normalizeDomain(value) {
  const trimmed = (value ?? "").trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.startsWith("www.") ? trimmed.slice(4) : trimmed;
}

function normalizeAppValue(value) {
  return (value ?? "").trim().toLowerCase();
}

function splitTargets(rows, activeTetherId = null) {
  const domains = new Set();
  const apps = new Set();
  const entries = [];

  for (const row of rows ?? []) {
    const tetherId = row.tether_id ?? null;
    if (row.target_type === "domain") {
      const domain = normalizeDomain(row.value);
      if (!domain) continue;
      domains.add(domain);
      entries.push({
        tetherId,
        targetType: "domain",
        value: domain,
        displayName: row.display_name ?? domain,
        bundleIdentifier: null,
      });
    } else if (row.target_type === "app") {
      const app = (row.value ?? "").trim();
      if (!app) continue;
      apps.add(app);
      entries.push({
        tetherId,
        targetType: "app",
        value: app,
        displayName: row.display_name ?? app,
        bundleIdentifier: row.bundle_identifier ?? null,
      });
    }
  }

  return {
    domains: [...domains],
    apps: [...apps],
    entries,
    activeTetherId,
  };
}

function domainMatchesValue(hostname, domain) {
  const normalizedHost = normalizeDomain(hostname);
  const normalizedDomain = normalizeDomain(domain);
  if (!normalizedHost || !normalizedDomain) return false;
  return (
    normalizedHost === normalizedDomain ||
    normalizedHost.endsWith(`.${normalizedDomain}`)
  );
}

async function loadCachedAllowlist() {
  const result = await chrome.storage.local.get([
    ALLOWLIST_CACHE_KEY,
    ALLOWLIST_FETCHED_AT_KEY,
    ACTIVE_TETHER_CACHE_KEY,
  ]);

  return {
    cache: {
      ...EMPTY_CACHE,
      ...(result[ALLOWLIST_CACHE_KEY] ?? {}),
      activeTetherId:
        result[ACTIVE_TETHER_CACHE_KEY] ??
        result[ALLOWLIST_CACHE_KEY]?.activeTetherId ??
        null,
    },
    fetchedAt: result[ALLOWLIST_FETCHED_AT_KEY] ?? 0,
  };
}

async function saveCachedAllowlist(cache) {
  await chrome.storage.local.set({
    [ALLOWLIST_CACHE_KEY]: cache,
    [ALLOWLIST_FETCHED_AT_KEY]: Date.now(),
    [ACTIVE_TETHER_CACHE_KEY]: cache.activeTetherId ?? null,
  });
}

async function fetchActiveTetherId() {
  try {
    const { response } = await authedRestRequest((session) =>
      fetch(`${supabaseUrl()}/rest/v1/rpc/ensure_my_active_tether`, {
        method: "POST",
        headers: authHeadersForSession(session),
        body: "{}",
      }),
    );
    const data = await response.json();
    return typeof data === "string" ? data : null;
  } catch {
    return null;
  }
}

export async function refreshAllowlist({ force = false } = {}) {
  const { cache, fetchedAt } = await loadCachedAllowlist();
  if (!force && Date.now() - fetchedAt < CACHE_TTL_MS) {
    return cache;
  }

  try {
    const [{ response }, activeTetherId] = await Promise.all([
      authedRestRequest((session) =>
        fetch(`${supabaseUrl()}/rest/v1/rpc/get_my_allowed_targets`, {
          method: "POST",
          headers: authHeadersForSession(session),
          body: "{}",
        }),
      ),
      fetchActiveTetherId(),
    ]);

    const rows = await response.json();
    const nextCache = splitTargets(rows, activeTetherId);
    await saveCachedAllowlist(nextCache);
    return nextCache;
  } catch (error) {
    if (cache.domains.length || cache.apps.length || cache.entries?.length) {
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

  return domains.some((domain) => domainMatchesValue(normalizedHost, domain));
}

export function urlMatchesAllowlist(url, domains) {
  const domain = parseDomain(url);
  if (!domain) return false;
  return domainMatchesAllowlist(domain, domains);
}

export function resolveDomainTetherId(url, allowlist) {
  const domain = parseDomain(url);
  if (!domain) return null;

  const matches = (allowlist.entries ?? []).filter(
    (entry) =>
      entry.targetType === "domain" && domainMatchesValue(domain, entry.value),
  );

  if (!matches.length) return null;

  const uniqueTetherIds = [...new Set(matches.map((entry) => entry.tetherId).filter(Boolean))];
  if (uniqueTetherIds.length === 1) return uniqueTetherIds[0];

  const activeTetherId = allowlist.activeTetherId ?? null;
  if (activeTetherId && uniqueTetherIds.includes(activeTetherId)) {
    return activeTetherId;
  }

  return null;
}

export function resolveAppTetherId(appTarget, allowlist) {
  const value = normalizeAppValue(appTarget?.value ?? appTarget?.display_name);
  const bundle = appTarget?.bundle_identifier ?? null;

  const matches = (allowlist.entries ?? []).filter((entry) => {
    if (entry.targetType !== "app") return false;
    if (bundle && entry.bundleIdentifier && bundle === entry.bundleIdentifier) {
      return true;
    }
    return normalizeAppValue(entry.value) === value;
  });

  if (!matches.length) return null;

  const uniqueTetherIds = [...new Set(matches.map((entry) => entry.tetherId).filter(Boolean))];
  if (uniqueTetherIds.length === 1) return uniqueTetherIds[0];

  const activeTetherId = allowlist.activeTetherId ?? null;
  if (activeTetherId && uniqueTetherIds.includes(activeTetherId)) {
    return activeTetherId;
  }

  return null;
}

export async function isUrlAllowed(url) {
  const allowlist = await getAllowlist();
  if (!allowlist.domains.length) return false;
  return urlMatchesAllowlist(url, allowlist.domains);
}

export async function clearAllowlistCache() {
  await chrome.storage.local.remove([
    ALLOWLIST_CACHE_KEY,
    ALLOWLIST_FETCHED_AT_KEY,
    ACTIVE_TETHER_CACHE_KEY,
  ]);
}
