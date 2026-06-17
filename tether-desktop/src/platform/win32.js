import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const platformId = "windows";
export const platformLabel = "Windows";

const DISCOVER_APPS_SCRIPT = `
$shell = New-Object -ComObject WScript.Shell
$roots = @(
  [Environment]::GetFolderPath('CommonPrograms'),
  [Environment]::GetFolderPath('Programs')
)
$apps = @{}
foreach ($root in $roots) {
  if (-not (Test-Path $root)) { continue }
  Get-ChildItem -Path $root -Recurse -Filter *.lnk -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $target = $shell.CreateShortcut($_.FullName).TargetPath
      if (-not $target -or $target -notmatch '\\.exe$') { return }
      $executable = [System.IO.Path]::GetFileName($target)
      $name = [System.IO.Path]::GetFileNameWithoutExtension($target)
      if (-not $name) { return }
      $key = $target.ToLowerInvariant()
      if ($apps.ContainsKey($key)) { return }
      $apps[$key] = [PSCustomObject]@{
        name = $name
        executable = $executable
        path = $target
      }
    } catch {}
  }
}
$apps.Values | Sort-Object name | ConvertTo-Json -Compress
`;

const FRONTMOST_APP_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class TetherWin32Foreground {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
$hwnd = [TetherWin32Foreground]::GetForegroundWindow()
$processId = [uint32]0
[void][TetherWin32Foreground]::GetWindowThreadProcessId($hwnd, [ref]$processId)
if ($processId -eq 0) { exit 1 }
$process = Get-Process -Id $processId -ErrorAction Stop
@{ displayName = $process.ProcessName; executableName = $process.ProcessName } | ConvertTo-Json -Compress
`;

async function runPowerShell(script) {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
  );
  return stdout.trim();
}

function normalizeWindowsApp(entry) {
  const displayName = String(entry.name ?? "").trim();
  const executable = String(entry.executable ?? "").trim();
  const installPath = String(entry.path ?? "").trim();
  if (!displayName || !installPath) return null;

  const toolKey = `path:${installPath.toLowerCase()}`;

  return {
    tool_type: "app",
    value: displayName,
    display_name: displayName,
    tool_key: toolKey,
    bundle_identifier: null,
    install_path: installPath,
    platform: platformId,
    metadata: {
      executable,
      source: "start_menu",
    },
  };
}

export async function detectInstalledApps() {
  const stdout = await runPowerShell(DISCOVER_APPS_SCRIPT);
  if (!stdout) return [];

  let entries;
  try {
    entries = JSON.parse(stdout);
  } catch {
    return [];
  }

  const rows = Array.isArray(entries) ? entries : [entries];
  const appsByKey = new Map();

  for (const entry of rows) {
    const detectedApp = normalizeWindowsApp(entry);
    if (!detectedApp) continue;
    appsByKey.set(detectedApp.tool_key, detectedApp);
  }

  return [...appsByKey.values()].sort((a, b) => a.display_name.localeCompare(b.display_name));
}

export async function getFrontmostApp() {
  const stdout = await runPowerShell(FRONTMOST_APP_SCRIPT);
  if (!stdout) {
    throw new Error("Could not read the active Windows app.");
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error("Could not parse the active Windows app.");
  }

  const displayName = String(parsed.displayName ?? "").trim();
  const executableName = String(parsed.executableName ?? displayName).trim();

  if (!displayName) {
    throw new Error("Could not read the active Windows app.");
  }

  return {
    displayName,
    bundleIdentifier: null,
    executableName: executableName || null,
  };
}

export function deviceDisplayName() {
  return os.hostname() || platformLabel;
}
