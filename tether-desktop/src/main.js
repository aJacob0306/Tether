import { createClient } from "@supabase/supabase-js";
import { app, BrowserWindow, ipcMain, powerMonitor } from "electron";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getPlatformAdapter } from "./platform/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, "..", "config.js");
const platformAdapter = getPlatformAdapter();

async function loadConfig() {
  try {
    return await import(pathToFileURL(configPath).href);
  } catch {
    return {};
  }
}

const {
  SUPABASE_ANON_KEY: RAW_SUPABASE_ANON_KEY,
  SUPABASE_URL: RAW_SUPABASE_URL,
} = await loadConfig();
const SUPABASE_URL = RAW_SUPABASE_URL?.trim().replace(/\/$/, "") ?? "https://example.supabase.co";
const SUPABASE_ANON_KEY = RAW_SUPABASE_ANON_KEY?.trim() ?? "sb_publishable_missing";
const hasSupabaseConfig = Boolean(RAW_SUPABASE_URL?.trim() && RAW_SUPABASE_ANON_KEY?.trim());
const PLATFORM = platformAdapter.platformId;
const DEVICE_TYPE = "desktop";
const UPSERT_CHUNK_SIZE = 100;
const TRACKING_POLL_MS = 5_000;
const TRACKING_IDLE_CLOSE_MS = 2 * 60 * 1000;
const TRACKING_IDLE_GRACE_MS = 30 * 1000;
const NOTIFY_COOLDOWN_MS = 30 * 60 * 1000;
const TRACKING_STATE_FILE = "tracking-state.json";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: false,
  },
});

let mainWindow = null;
let currentSession = null;
let currentDevice = null;
let trackingInterval = null;
let trackingTickPromise = null;
let isQuitting = false;

function storePath(fileName) {
  return path.join(app.getPath("userData"), fileName);
}

async function readJson(fileName) {
  try {
    const raw = await fs.readFile(storePath(fileName), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeJson(fileName, value) {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(storePath(fileName), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function removeJson(fileName) {
  try {
    await fs.rm(storePath(fileName));
  } catch {
    // Missing local state is fine during sign out.
  }
}

function sendTrackingStatus(message) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("tracking:status", {
    message,
    updatedAt: new Date().toISOString(),
  });
}

function assertConfig() {
  if (!hasSupabaseConfig) {
    throw new Error("Copy config.example.js to config.js and add Supabase credentials.");
  }
}

async function getInstallationId() {
  const existing = await readJson("device.json");
  if (existing?.installationId) return existing.installationId;

  const installationId = randomUUID();
  await writeJson("device.json", { installationId });
  return installationId;
}

function publicSession(session) {
  if (!session?.user) return null;
  return {
    email: session.user.email,
    userId: session.user.id,
  };
}

async function setCurrentSession(session) {
  currentSession = session;
  if (session?.access_token && session?.refresh_token) {
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    await writeJson("session.json", session);
    return;
  }

  await supabase.auth.signOut();
  await removeJson("session.json");
}

async function loadSavedSession() {
  const savedSession = await readJson("session.json");
  if (!savedSession?.access_token || !savedSession?.refresh_token) return null;

  const { data, error } = await supabase.auth.setSession({
    access_token: savedSession.access_token,
    refresh_token: savedSession.refresh_token,
  });

  if (error || !data.session) {
    await removeJson("session.json");
    return null;
  }

  currentSession = data.session;
  await writeJson("session.json", data.session);
  return data.session;
}

async function ensureSession() {
  if (!currentSession) {
    currentSession = await loadSavedSession();
  }

  if (!currentSession?.user?.id) {
    throw new Error("Sign in first.");
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session) {
    currentSession = data.session;
    await writeJson("session.json", data.session);
  }

  return currentSession;
}

async function registerDevice() {
  assertConfig();
  const session = await ensureSession();
  const installationId = await getInstallationId();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("devices")
    .upsert(
      {
        user_id: session.user.id,
        installation_id: installationId,
        platform: PLATFORM,
        device_type: DEVICE_TYPE,
        display_name: platformAdapter.deviceDisplayName(),
        app_version: app.getVersion(),
        last_seen_at: now,
      },
      { onConflict: "user_id,installation_id" },
    )
    .select("*")
    .single();

  if (error) throw error;
  currentDevice = data;
  return data;
}

async function detectInstalledApps() {
  return platformAdapter.detectInstalledApps();
}

async function uploadDetectedApps(detectedApps) {
  const session = await ensureSession();
  const device = currentDevice ?? (await registerDevice());
  const now = new Date().toISOString();

  const { error: staleError } = await supabase
    .from("detected_tools")
    .update({ is_available: false, last_seen_at: now })
    .eq("device_id", device.id)
    .eq("tool_type", "app");

  if (staleError) throw staleError;

  const rows = detectedApps.map((detectedApp) => ({
    ...detectedApp,
    user_id: session.user.id,
    device_id: device.id,
    is_available: true,
    detected_at: now,
    last_seen_at: now,
  }));

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
    const { error } = await supabase.from("detected_tools").upsert(chunk, {
      onConflict: "user_id,device_id,tool_type,tool_key",
    });
    if (error) throw error;
  }

  return rows.length;
}

async function syncDetectedApps() {
  await registerDevice();
  const apps = await detectInstalledApps();
  const uploadedCount = await uploadDetectedApps(apps);
  return {
    detectedCount: apps.length,
    uploadedCount,
    syncedAt: new Date().toISOString(),
  };
}

function normalizeMatchValue(value) {
  return (value ?? "").trim().toLowerCase();
}

function appMatchKey(appTarget) {
  return (
    appTarget.bundle_identifier ||
    appTarget.display_name ||
    appTarget.value ||
    appTarget.id
  );
}

function executableBaseName(value) {
  return normalizeMatchValue(value).replace(/\.exe$/i, "");
}

async function getFrontmostApp() {
  return platformAdapter.getFrontmostApp();
}

async function fetchAllowedAppTargets() {
  const { data, error } = await supabase
    .from("tether_allowed_targets")
    .select("id,value,display_name,bundle_identifier,platform,metadata")
    .eq("target_type", "app")
    .order("value", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

function matchesAllowedApp(activeApp, appTarget) {
  if (
    activeApp.bundleIdentifier &&
    appTarget.bundle_identifier &&
    activeApp.bundleIdentifier === appTarget.bundle_identifier
  ) {
    return true;
  }

  const activeNames = [
    activeApp.displayName,
    activeApp.executableName,
  ]
    .map((value) => executableBaseName(value))
    .filter(Boolean);
  const targetNames = [
    appTarget.display_name,
    appTarget.value,
    appTarget.metadata?.bundleName,
    appTarget.metadata?.executable,
  ]
    .map((value) => executableBaseName(value))
    .filter(Boolean);

  return activeNames.some((activeName) => targetNames.includes(activeName));
}

function findAllowedApp(activeApp, appTargets) {
  return appTargets.find((appTarget) => matchesAllowedApp(activeApp, appTarget)) ?? null;
}

async function getOpenWorkSession() {
  const session = await ensureSession();
  const { data, error } = await supabase
    .from("work_sessions")
    .select(
      "id,user_id,domain,url,title,started_at,ended_at,target_type,target_value,target_display_name,bundle_identifier,platform",
    )
    .eq("user_id", session.user.id)
    .is("ended_at", null)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function closeWorkSession(sessionId, endedAt = new Date().toISOString()) {
  const { error } = await supabase
    .from("work_sessions")
    .update({ ended_at: endedAt })
    .eq("id", sessionId);

  if (error) throw error;
}

async function updateAppWorkSession(sessionId, appTarget) {
  const label = appTarget.display_name || appTarget.value;
  const { data, error } = await supabase
    .from("work_sessions")
    .update({
      domain: label,
      title: label,
      target_type: "app",
      target_value: appTarget.value,
      target_display_name: label,
      bundle_identifier: appTarget.bundle_identifier,
      platform: appTarget.platform,
      metadata: {
        source: "desktop_active_app",
        ...appTarget.metadata,
      },
    })
    .eq("id", sessionId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function startAppWorkSession(appTarget) {
  const session = await ensureSession();
  const label = appTarget.display_name || appTarget.value;
  const payload = {
    user_id: session.user.id,
    domain: label,
    url: "",
    title: label,
    target_type: "app",
    target_value: appTarget.value,
    target_display_name: label,
    bundle_identifier: appTarget.bundle_identifier,
    platform: appTarget.platform,
    metadata: {
      source: "desktop_active_app",
      ...appTarget.metadata,
    },
  };

  const { data, error } = await supabase
    .from("work_sessions")
    .insert(payload)
    .select("*")
    .single();

  if (!error) return data;

  const message = error.message?.toLowerCase() ?? "";
  if (!message.includes("duplicate key") && error.code !== "23505") {
    throw error;
  }

  const existing = await getOpenWorkSession();
  if (existing?.id) {
    await closeWorkSession(existing.id);
  }

  const { data: retryData, error: retryError } = await supabase
    .from("work_sessions")
    .insert(payload)
    .select("*")
    .single();

  if (retryError) throw retryError;
  return retryData;
}

async function notifyPeersStartedApp(appTarget) {
  const trackingState = (await readJson(TRACKING_STATE_FILE)) ?? {};
  if (Date.now() - (trackingState.lastNotifyAt ?? 0) < NOTIFY_COOLDOWN_MS) {
    return;
  }

  const session = await ensureSession();
  const label = appTarget.display_name || appTarget.value;
  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-work-started-push`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      target_type: "app",
      target_label: label,
      bundle_identifier: appTarget.bundle_identifier,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || `Notify failed (${response.status})`);
  }

  await writeJson(TRACKING_STATE_FILE, {
    ...trackingState,
    lastNotifyAt: Date.now(),
  });
}

function getIdleMs() {
  return powerMonitor.getSystemIdleTime() * 1000;
}

function isSystemIdle() {
  return getIdleMs() >= TRACKING_IDLE_CLOSE_MS;
}

function idleEndedAt() {
  const idleStartedAt = Date.now() - getIdleMs();
  const endedAt = Math.min(Date.now(), idleStartedAt + TRACKING_IDLE_GRACE_MS);
  return new Date(endedAt).toISOString();
}

function idleSessionEndedAt(trackingState) {
  const sessionStartedAt = trackingState?.sessionStartedAt
    ? new Date(trackingState.sessionStartedAt).getTime()
    : null;
  const idleEndAt = new Date(idleEndedAt()).getTime();
  const endedAt =
    sessionStartedAt && Number.isFinite(sessionStartedAt)
      ? Math.max(sessionStartedAt, idleEndAt)
      : idleEndAt;

  return new Date(endedAt).toISOString();
}

async function closeTrackedAppSessionIfNeeded(trackingState, endedAt) {
  if (!trackingState?.openSessionId) return;

  try {
    await closeWorkSession(trackingState.openSessionId, endedAt);
  } finally {
    await writeJson(TRACKING_STATE_FILE, {
      ...trackingState,
      openSessionId: null,
      targetKey: null,
      targetLabel: null,
      lastActiveAt: null,
      sessionStartedAt: null,
    });
  }
}

async function syncActiveAppOnce() {
  await ensureSession();
  const trackingState = (await readJson(TRACKING_STATE_FILE)) ?? {};

  if (isSystemIdle()) {
    await closeTrackedAppSessionIfNeeded(trackingState, idleSessionEndedAt(trackingState));
    sendTrackingStatus(`Tracking paused: ${platformAdapter.platformLabel} is idle.`);
    return;
  }

  const [activeApp, appTargets] = await Promise.all([
    getFrontmostApp(),
    fetchAllowedAppTargets(),
  ]);
  const allowedApp = findAllowedApp(activeApp, appTargets);
  const nowIso = new Date().toISOString();

  if (!allowedApp) {
    await closeTrackedAppSessionIfNeeded(trackingState);
    sendTrackingStatus(`No allowlisted app active (${activeApp.displayName}).`);
    return;
  }

  const targetKey = appMatchKey(allowedApp);
  const targetLabel = allowedApp.display_name || allowedApp.value;

  if (trackingState.openSessionId && trackingState.targetKey === targetKey) {
    await updateAppWorkSession(trackingState.openSessionId, allowedApp);
    await writeJson(TRACKING_STATE_FILE, {
      ...trackingState,
      lastActiveAt: nowIso,
    });
    sendTrackingStatus(`Tracking ${targetLabel}.`);
    return;
  }

  await closeTrackedAppSessionIfNeeded(trackingState);
  const workSession = await startAppWorkSession(allowedApp);
  await writeJson(TRACKING_STATE_FILE, {
    ...trackingState,
    openSessionId: workSession.id,
    targetKey,
    targetLabel,
    lastActiveAt: nowIso,
    sessionStartedAt: workSession.started_at ?? nowIso,
  });

  notifyPeersStartedApp(allowedApp).catch((error) => {
    console.log("[Tether Desktop] Work-start notify failed:", error.message);
  });

  sendTrackingStatus(`Tracking ${targetLabel}.`);
}

function closeTrackedSessionForSystemEvent(reason) {
  flushTrackedSessionClose(reason).catch((error) => {
    console.log("[Tether Desktop] System pause close failed:", error.message);
  });
}

async function flushTrackedSessionClose(reason) {
  const trackingState = (await readJson(TRACKING_STATE_FILE)) ?? {};
  if (!trackingState.openSessionId) {
    sendTrackingStatus(`Tracking paused: ${reason}.`);
    return;
  }

  const endedAt = idleSessionEndedAt(trackingState);
  await closeTrackedAppSessionIfNeeded(trackingState, endedAt);
  sendTrackingStatus(`Tracking paused: ${reason}.`);
}

function setupPowerMonitorHandlers() {
  powerMonitor.on("suspend", () =>
    closeTrackedSessionForSystemEvent(`${platformAdapter.platformLabel} is suspending`),
  );
  powerMonitor.on("lock-screen", () =>
    closeTrackedSessionForSystemEvent(`${platformAdapter.platformLabel} is locked`),
  );
  powerMonitor.on("shutdown", () =>
    closeTrackedSessionForSystemEvent(`${platformAdapter.platformLabel} is shutting down`),
  );
}

function startTrackingLoop() {
  if (trackingInterval) return;
  sendTrackingStatus("Active app tracking started.");

  const runTick = () => {
    if (trackingTickPromise) return;
    trackingTickPromise = syncActiveAppOnce()
      .catch((error) => {
        console.log("[Tether Desktop] Active app tracking skipped:", error.message);
        sendTrackingStatus(`Tracking paused: ${error.message}`);
      })
      .finally(() => {
        trackingTickPromise = null;
      });
  };

  runTick();
  trackingInterval = setInterval(runTick, TRACKING_POLL_MS);
}

async function stopTrackingLoop() {
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }

  const trackingState = (await readJson(TRACKING_STATE_FILE)) ?? {};
  await closeTrackedAppSessionIfNeeded(trackingState);
  sendTrackingStatus("Active app tracking stopped.");
}

async function closeStaleOpenWorkSessions(staleMinutes = 15) {
  const session = await ensureSession();
  const { error } = await supabase.rpc("close_stale_open_work_sessions", {
    p_stale_minutes: staleMinutes,
  });

  if (error) throw error;
}

async function getStatus() {
  const session = currentSession ?? (await loadSavedSession());
  const trackingState = (await readJson(TRACKING_STATE_FILE)) ?? {};
  return {
    session: publicSession(session),
    device: currentDevice,
    tracking: {
      active: Boolean(trackingInterval),
      targetLabel: trackingState.targetLabel ?? null,
    },
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 680,
    minWidth: 460,
    minHeight: 560,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

ipcMain.handle("auth:status", async () => getStatus());

ipcMain.handle("auth:signIn", async (_event, { email, password }) => {
  assertConfig();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) throw error;
  await setCurrentSession(data.session);
  const sync = await syncDetectedApps();
  startTrackingLoop();
  return { session: publicSession(data.session), device: currentDevice, sync };
});

ipcMain.handle("auth:signOut", async () => {
  await stopTrackingLoop();
  currentDevice = null;
  await setCurrentSession(null);
  return { ok: true };
});

ipcMain.handle("apps:sync", async () => syncDetectedApps());

app.whenReady().then(async () => {
  setupPowerMonitorHandlers();
  await loadSavedSession();
  if (currentSession) {
    closeStaleOpenWorkSessions().catch((error) => {
      console.log("[Tether Desktop] Stale session cleanup failed:", error.message);
    });
    registerDevice()
      .then(() => startTrackingLoop())
      .catch(() => {});
  }
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (isQuitting) return;

  event.preventDefault();
  isQuitting = true;

  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }

  flushTrackedSessionClose("Desktop companion is quitting")
    .catch((error) => {
      console.log("[Tether Desktop] Quit close failed:", error.message);
    })
    .finally(() => {
      app.quit();
    });
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
