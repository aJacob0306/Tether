import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const platformId = "windows";
export const platformLabel = "Windows";

const DISCOVER_APPS_SCRIPT = `
$shell = New-Object -ComObject WScript.Shell
$shellApplication = New-Object -ComObject Shell.Application
$apps = @{}

function Add-App($name, $path, $source) {
  try {
    if (-not $name -or -not $path) { return }
    $expandedPath = [Environment]::ExpandEnvironmentVariables($path.Trim('"'))
    if ($expandedPath -notmatch '\\.exe$') { return }
    if (-not (Test-Path -LiteralPath $expandedPath -PathType Leaf)) { return }

    $resolvedPath = (Resolve-Path -LiteralPath $expandedPath -ErrorAction Stop).Path
    $executable = [System.IO.Path]::GetFileName($resolvedPath)
    if (Test-IgnoredExecutableName $executable) { return }
    $displayName = $name.Trim()
    if (-not $displayName) {
      $displayName = [System.IO.Path]::GetFileNameWithoutExtension($resolvedPath)
    }
    if (-not $displayName) { return }

    $key = $resolvedPath.ToLowerInvariant()
    if ($apps.ContainsKey($key)) { return }

    $apps[$key] = [PSCustomObject]@{
      name = $displayName
      executable = $executable
      path = $resolvedPath
      source = $source
    }
  } catch {}
}

function Add-UrlApp($name, $url, $source) {
  try {
    if (-not $name -or -not $url) { return }
    $displayName = $name.Trim()
    $targetUrl = $url.Trim()
    if (-not $displayName -or -not $targetUrl) { return }
    if ($targetUrl -notmatch '^(steam|com\\.epicgames\\.launcher|uplay|origin|goggalaxy|battlenet):') { return }

    $key = $targetUrl.ToLowerInvariant()
    if ($apps.ContainsKey($key)) { return }

    $apps[$key] = [PSCustomObject]@{
      name = $displayName
      executable = $null
      path = $targetUrl
      source = $source
    }
  } catch {}
}

function Get-ExecutableFromCommand($command) {
  if (-not $command) { return $null }
  $expanded = [Environment]::ExpandEnvironmentVariables($command.Trim())
  if (-not $expanded) { return $null }

  if ($expanded.StartsWith('"')) {
    $endQuote = $expanded.IndexOf('"', 1)
    if ($endQuote -gt 1) {
      return $expanded.Substring(1, $endQuote - 1)
    }
  }

  $exeMatch = [regex]::Match($expanded, '^[^"]*?\\.exe')
  if ($exeMatch.Success) {
    return $exeMatch.Value.Trim()
  }

  return $expanded.Split(' ')[0]
}

$ignoredExeNames = @(
  'unins000.exe',
  'uninstall.exe',
  'unins.exe',
  'setup.exe',
  'install.exe',
  'update.exe',
  'updater.exe',
  'crashpad_handler.exe',
  'squirrel.exe',
  'maintenancetool.exe'
)

function Test-IgnoredExecutableName($executable) {
  if (-not $executable) { return $true }
  $normalizedExecutable = $executable.ToLowerInvariant()
  $baseName = [System.IO.Path]::GetFileNameWithoutExtension($normalizedExecutable)

  if ($ignoredExeNames -contains $normalizedExecutable) { return $true }
  if ($baseName -match '(^|[-_\\s])(installer|install|uninstall|updater?|patcher)([-_\\s]|$)') { return $true }
  if ($baseName -match '(setup|installer|uninstall|updater?|patcher)([-_\\s]|$)') { return $true }

  return $false
}

$helperPathPattern = '\\(bin|resources|locales|swiftshader|node_modules|plugins|drivers|redist|redistributable|crashpad|cef|vc_redist)\\'

function Get-DisplayNameForExecutable($file) {
  try {
    $productName = $file.VersionInfo.ProductName
    if ($productName) { return $productName.Trim() }
  } catch {}

  return [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
}

function Add-ExecutableFilesUnderRoot($root, $source, $depth) {
  try {
    if (-not $root -or -not (Test-Path -LiteralPath $root -PathType Container)) { return }
    $resolvedRoot = (Resolve-Path -LiteralPath $root -ErrorAction Stop).Path

    Get-ChildItem -Path $resolvedRoot -Filter *.exe -File -Recurse -Depth $depth -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        $relativePath = $_.FullName.Substring($resolvedRoot.Length)
        if (
          (-not (Test-IgnoredExecutableName $_.Name)) -and
          ($relativePath -notmatch $helperPathPattern)
        ) {
          $name = Get-DisplayNameForExecutable $_
          Add-App $name $_.FullName $source
        }
      } catch {}
    }
  } catch {}
}

function Add-ShellApplicationItems($root, $source) {
  try {
    if (-not $root -or -not (Test-Path -LiteralPath $root -PathType Container)) { return }
    $namespace = $shellApplication.Namespace($root)
    if (-not $namespace) { return }

    $namespace.Items() | ForEach-Object {
      try {
        if ($_.Type -eq 'Application') {
          Add-App $_.Name $_.Path $source
        }
      } catch {}
    }
  } catch {}
}

function Find-MainExecutableInDirectory($directory) {
  try {
    if (-not $directory) { return $null }
    $expandedDirectory = [Environment]::ExpandEnvironmentVariables($directory.Trim('"'))
    if (-not (Test-Path -LiteralPath $expandedDirectory -PathType Container)) { return $null }

    $directoryName = [System.IO.Path]::GetFileName($expandedDirectory.TrimEnd('\\')).ToLowerInvariant()
    $executables = Get-ChildItem -Path $expandedDirectory -Filter *.exe -File -Recurse -Depth 3 -ErrorAction SilentlyContinue |
      Where-Object {
        $name = $_.Name.ToLowerInvariant()
        if (Test-IgnoredExecutableName $name) { return $false }

        $relativePath = $_.FullName.Substring($expandedDirectory.Length)
        return $relativePath -notmatch $helperPathPattern
      } |
      Sort-Object -Property @{ Expression = { if ([System.IO.Path]::GetFileNameWithoutExtension($_.Name).ToLowerInvariant() -eq $directoryName) { 0 } else { 1 } } }, @{ Expression = { $_.DirectoryName.Length } }, @{ Expression = { -$_.Length } }

    return $executables[0].FullName
  } catch {
    return $null
  }
}

$shortcutRoots = @(
  [Environment]::GetFolderPath('CommonPrograms'),
  [Environment]::GetFolderPath('Programs'),
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('CommonDesktopDirectory')
)
foreach ($root in $shortcutRoots) {
  if (-not (Test-Path $root)) { continue }
  Get-ChildItem -Path $root -Recurse -Filter *.lnk -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $target = $shell.CreateShortcut($_.FullName).TargetPath
      $name = [System.IO.Path]::GetFileNameWithoutExtension($target)
      Add-App $name $target "shortcut"
    } catch {}
  }

  Get-ChildItem -Path $root -Recurse -Filter *.url -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $name = [System.IO.Path]::GetFileNameWithoutExtension($_.Name)
      $url = $null

      Get-Content -Path $_.FullName -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_ -match '^URL=(.+)$') {
          $url = $matches[1]
        }
      }

      Add-UrlApp $name $url "url_shortcut"
    } catch {}
  }
}

$registryRoots = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
foreach ($root in $registryRoots) {
  Get-ItemProperty -Path $root -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $name = $_.DisplayName
      if (-not $name) { return }

      $path = Get-ExecutableFromCommand $_.DisplayIcon
      if ($path) {
        $executableName = [System.IO.Path]::GetFileName($path).ToLowerInvariant()
        if (Test-IgnoredExecutableName $executableName) {
          $path = $null
        }
      }
      if (-not $path) { $path = Find-MainExecutableInDirectory $_.InstallLocation }
      Add-App $name $path "registry"
    } catch {}
  }
}

$appPathRoots = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\*',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\*',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\*'
)
foreach ($root in $appPathRoots) {
  Get-ItemProperty -Path $root -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $path = Get-ExecutableFromCommand $_.'(default)'
      if (-not $path) { $path = Get-ExecutableFromCommand $_.Path }
      $name = [System.IO.Path]::GetFileNameWithoutExtension($_.PSChildName)
      Add-App $name $path "app_path"
    } catch {}
  }
}

$scanRoots = @(
  $env:ProgramFiles,
  \${env:ProgramFiles(x86)},
  $env:LOCALAPPDATA,
  (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'),
  (Join-Path $env:USERPROFILE 'Downloads'),
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('CommonDesktopDirectory'),
  (Join-Path $env:USERPROFILE 'OneDrive\\Desktop'),
  (Join-Path $env:USERPROFILE 'OneDrive\\Documents'),
  (Join-Path $env:USERPROFILE 'Documents')
) | Where-Object { $_ -and (Test-Path $_) }

foreach ($root in $scanRoots) {
  Add-ShellApplicationItems $root "shell_application"
  Add-ExecutableFilesUnderRoot $root "application_file" 4
}

$steamLibraryFiles = @(
  (Join-Path \${env:ProgramFiles(x86)} 'Steam\\steamapps\\libraryfolders.vdf'),
  (Join-Path $env:ProgramFiles 'Steam\\steamapps\\libraryfolders.vdf')
) | Where-Object { $_ -and (Test-Path $_) }

$steamLibraries = New-Object System.Collections.Generic.HashSet[string]
foreach ($libraryFile in $steamLibraryFiles) {
  try {
    $libraryRoot = Split-Path (Split-Path $libraryFile -Parent) -Parent
    [void]$steamLibraries.Add($libraryRoot)

    Get-Content -Path $libraryFile -ErrorAction SilentlyContinue | ForEach-Object {
      $match = [regex]::Match($_, '"path"\\s+"([^"]+)"')
      if ($match.Success) {
        [void]$steamLibraries.Add($match.Groups[1].Value.Replace('\\\\', '\\'))
      }
    }
  } catch {}
}

foreach ($libraryRoot in $steamLibraries) {
  $commonRoot = Join-Path $libraryRoot 'steamapps\\common'
  if (-not (Test-Path $commonRoot)) { continue }

  Get-ChildItem -Path $commonRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $exePath = Find-MainExecutableInDirectory $_.FullName
    if ($exePath) {
      Add-App $_.Name $exePath "steam"
    }
  }
}

$allowedProcessRoots = $scanRoots + ($steamLibraries | ForEach-Object { Join-Path $_ 'steamapps\\common' })
$allowedProcessRoots = $allowedProcessRoots |
  Where-Object { $_ -and (Test-Path $_) } |
  ForEach-Object { (Resolve-Path -LiteralPath $_ -ErrorAction SilentlyContinue).Path.ToLowerInvariant() }

Get-Process -ErrorAction SilentlyContinue | ForEach-Object {
  try {
    $processPath = $_.Path
    if (-not $processPath -or $processPath -notmatch '\\.exe$') { return }

    $resolvedProcessPath = (Resolve-Path -LiteralPath $processPath -ErrorAction Stop).Path
    $normalizedProcessPath = $resolvedProcessPath.ToLowerInvariant()
    $isAllowedRoot = $false

    foreach ($root in $allowedProcessRoots) {
      if ($normalizedProcessPath.StartsWith($root)) {
        $relativeProcessPath = $normalizedProcessPath.Substring($root.Length)
        if ($relativeProcessPath -match $helperPathPattern) {
          return
        }
        $isAllowedRoot = $true
        break
      }
    }

    if (-not $isAllowedRoot) { return }
    Add-App $_.ProcessName $resolvedProcessPath "running_process"
  } catch {}
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
  const source = String(entry.source ?? "windows_scan").trim();
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
      source,
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
