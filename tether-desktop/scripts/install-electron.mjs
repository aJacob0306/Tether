import { downloadArtifact } from "@electron/get";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const electronDir = path.join(projectRoot, "node_modules", "electron");
const distPath = path.join(electronDir, "dist");
const pathFile = path.join(electronDir, "path.txt");

function getPlatformPath() {
  if (process.platform === "win32") return "electron.exe";
  if (process.platform === "darwin") return "Electron.app/Contents/MacOS/Electron";
  return "electron";
}

function isInstalled(version, platformPath) {
  try {
    const installedVersion = fs
      .readFileSync(path.join(distPath, "version"), "utf8")
      .replace(/^v/, "");
    const recordedPath = fs.readFileSync(pathFile, "utf8");
    const binaryPath = path.join(distPath, platformPath);
    return installedVersion === version && recordedPath === platformPath && fs.existsSync(binaryPath);
  } catch {
    return false;
  }
}

async function extractZip(zipPath, destination) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });

  if (process.platform === "win32") {
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: "inherit" },
    );
    return;
  }

  const extract = (await import("extract-zip")).default;
  await extract(zipPath, { dir: destination });
}

async function main() {
  if (!fs.existsSync(electronDir)) {
    console.error("Run npm install first — node_modules/electron is missing.");
    process.exit(1);
  }

  const { version } = JSON.parse(fs.readFileSync(path.join(electronDir, "package.json"), "utf8"));
  const platformPath = getPlatformPath();

  if (isInstalled(version, platformPath)) {
    console.log(`Electron ${version} already installed.`);
    return;
  }

  console.log(`Installing Electron ${version} for ${process.platform} ${process.arch}...`);

  const zipPath = await downloadArtifact({
    version,
    artifactName: "electron",
    platform: process.platform,
    arch: process.arch,
    force: process.env.force_no_cache === "true",
  });

  console.log(`Downloaded ${(fs.statSync(zipPath).size / 1e6).toFixed(1)} MB`);

  await extractZip(zipPath, distPath);

  const binaryPath = path.join(distPath, platformPath);
  if (!fs.existsSync(binaryPath)) {
    console.error(`Electron binary missing after extract: ${binaryPath}`);
    process.exit(1);
  }

  await fs.promises.writeFile(pathFile, platformPath);
  await fs.promises.writeFile(path.join(distPath, "version"), `v${version}`);

  console.log(`Electron ready: ${binaryPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
