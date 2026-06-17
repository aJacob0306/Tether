import { nativeImage } from "electron";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const platformId = "macos";
export const platformLabel = "Mac";

const APP_DISCOVERY_ROOTS = ["/Applications", path.join(os.homedir(), "Applications")];
const MAX_DISCOVERY_DEPTH = 3;

const FRONTMOST_APP_SCRIPT = `
tell application "System Events"
  set frontApp to first application process whose frontmost is true
  set appName to name of frontApp
  set bundleId to bundle identifier of frontApp
  return appName & linefeed & bundleId
end tell
`;

async function listDirectoryEntries(directory) {
  try {
    return await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function findAppBundles(directory, depth = 0, found = []) {
  if (depth > MAX_DISCOVERY_DEPTH) return found;

  const entries = await listDirectoryEntries(directory);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const entryPath = path.join(directory, entry.name);
    if (entry.name.endsWith(".app")) {
      found.push(entryPath);
      continue;
    }

    await findAppBundles(entryPath, depth + 1, found);
  }

  return found;
}

async function readInfoPlist(appPath) {
  const plistPath = path.join(appPath, "Contents", "Info.plist");
  try {
    const { stdout } = await execFileAsync("/usr/bin/plutil", [
      "-convert",
      "json",
      "-o",
      "-",
      plistPath,
    ]);
    return JSON.parse(stdout);
  } catch {
    return {};
  }
}

function appNameFromPath(appPath) {
  return path.basename(appPath, ".app").trim();
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveIconPath(appPath, plist) {
  const iconFile = plist.CFBundleIconFile;
  if (!iconFile || typeof iconFile !== "string") return null;

  const resourcesPath = path.join(appPath, "Contents", "Resources");
  const candidates = [
    path.join(resourcesPath, iconFile),
    path.join(resourcesPath, `${iconFile}.icns`),
  ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }

  return null;
}

async function appIconDataUrl(appPath, plist) {
  const iconPath = await resolveIconPath(appPath, plist);
  if (!iconPath) return null;

  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) return null;

  return icon.resize({ width: 64, height: 64 }).toDataURL();
}

function normalizeAppBundle(appPath, plist) {
  const displayName =
    plist.CFBundleDisplayName ||
    plist.CFBundleName ||
    plist.CFBundleExecutable ||
    appNameFromPath(appPath);
  const bundleIdentifier = plist.CFBundleIdentifier || null;
  const toolKey = bundleIdentifier ? `bundle:${bundleIdentifier}` : `path:${appPath}`;

  return {
    tool_type: "app",
    value: String(displayName).trim(),
    display_name: String(displayName).trim(),
    tool_key: toolKey,
    bundle_identifier: bundleIdentifier,
    install_path: appPath,
    platform: platformId,
    metadata: {
      bundleName: plist.CFBundleName ?? null,
      executable: plist.CFBundleExecutable ?? null,
      version: plist.CFBundleShortVersionString ?? plist.CFBundleVersion ?? null,
    },
  };
}

export async function detectInstalledApps() {
  const bundlePaths = new Set();
  for (const root of APP_DISCOVERY_ROOTS) {
    const apps = await findAppBundles(root);
    apps.forEach((appPath) => bundlePaths.add(appPath));
  }

  const appsByKey = new Map();
  for (const appPath of bundlePaths) {
    const plist = await readInfoPlist(appPath);
    const detectedApp = normalizeAppBundle(appPath, plist);
    if (!detectedApp.value) continue;
    detectedApp.metadata.iconDataUrl = await appIconDataUrl(appPath, plist);
    appsByKey.set(detectedApp.tool_key, detectedApp);
  }

  return [...appsByKey.values()].sort((a, b) => a.display_name.localeCompare(b.display_name));
}

export async function getFrontmostApp() {
  const { stdout } = await execFileAsync("/usr/bin/osascript", ["-e", FRONTMOST_APP_SCRIPT]);
  const [nameLine, bundleLine] = stdout.trim().split(/\r?\n/);
  const displayName = nameLine?.trim() ?? "";
  const bundleIdentifier = bundleLine?.trim() ?? "";

  if (!displayName) {
    throw new Error("Could not read the active macOS app.");
  }

  return {
    displayName,
    bundleIdentifier: bundleIdentifier || null,
    executableName: null,
  };
}

export function deviceDisplayName() {
  return os.hostname() || platformLabel;
}
