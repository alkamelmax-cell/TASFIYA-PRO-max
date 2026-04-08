"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const electronPath = require("electron");

const projectRoot = path.resolve(__dirname, "..");
const cacheDir = path.join(projectRoot, "node_modules", ".cache", "tasfiya-pro");
const markerPath = path.join(cacheDir, "electron-native-deps.json");
const packageLockPath = path.join(projectRoot, "package-lock.json");
const electronPackageJsonPath = path.join(projectRoot, "node_modules", "electron", "package.json");
const betterSqliteBinaryPath = path.join(
  projectRoot,
  "node_modules",
  "better-sqlite3",
  "build",
  "Release",
  "better_sqlite3.node"
);
const moduleProbeScript = `
try {
  require("better-sqlite3");
  process.exit(0);
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
`;

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function getFileStats(filePath) {
  try {
    return fs.statSync(filePath);
  } catch (error) {
    return null;
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return null;
  }
}

function buildDependencySignature() {
  const electronPackage = readJson(electronPackageJsonPath);
  const packageLockStats = getFileStats(packageLockPath);
  const electronPackageStats = getFileStats(electronPackageJsonPath);
  const nativeBinaryStats = getFileStats(betterSqliteBinaryPath);

  const payload = {
    electronVersion: electronPackage?.version || null,
    electronPackageMtime: electronPackageStats ? electronPackageStats.mtimeMs : null,
    packageLockMtime: packageLockStats ? packageLockStats.mtimeMs : null,
    packageLockSize: packageLockStats ? packageLockStats.size : null,
    betterSqliteBinaryMtime: nativeBinaryStats ? nativeBinaryStats.mtimeMs : null,
    betterSqliteBinarySize: nativeBinaryStats ? nativeBinaryStats.size : null
  };

  return crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex");
}

function loadMarker() {
  try {
    if (!fs.existsSync(markerPath)) {
      return null;
    }

    return JSON.parse(fs.readFileSync(markerPath, "utf8"));
  } catch (error) {
    return null;
  }
}

function saveMarker(signature) {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    markerPath,
    JSON.stringify(
      {
        signature,
        verifiedAt: new Date().toISOString()
      },
      null,
      2
    ),
    "utf8"
  );
}

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function buildElectronNodeEnv(baseEnv = process.env) {
  return {
    ...baseEnv,
    ELECTRON_RUN_AS_NODE: "1"
  };
}

function buildElectronAppEnv(baseEnv = process.env) {
  const env = { ...baseEnv };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function getElectronModuleProbeArgs() {
  return ["-e", moduleProbeScript];
}

function runElectronModuleProbe() {
  const result = spawnSync(electronPath, getElectronModuleProbeArgs(), {
    cwd: projectRoot,
    env: buildElectronNodeEnv(),
    encoding: "utf8"
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function runNativeDependenciesRebuild() {
  return spawnSync(getNpmCommand(), ["run", "rebuild"], {
    cwd: projectRoot,
    env: buildElectronAppEnv(),
    stdio: "inherit"
  });
}

function ensureElectronNativeDeps() {
  if (isTruthy(process.env.SKIP_ELECTRON_NATIVE_REBUILD)) {
    return;
  }

  const currentSignature = buildDependencySignature();
  const marker = loadMarker();

  if (marker && marker.signature === currentSignature) {
    return;
  }

  console.log("🔎 [ELECTRON] Checking native dependency compatibility...");
  const probe = runElectronModuleProbe();
  if (probe.status === 0) {
    saveMarker(currentSignature);
    return;
  }

  if (probe.stdout) {
    process.stdout.write(probe.stdout);
  }
  if (probe.stderr) {
    process.stderr.write(probe.stderr);
  }

  console.log("🔄 [ELECTRON] Rebuilding native dependencies for Electron...");
  const rebuild = runNativeDependenciesRebuild();
  if (rebuild.status !== 0) {
    throw new Error("Failed to rebuild Electron native dependencies.");
  }

  const postRebuildSignature = buildDependencySignature();
  const recheck = runElectronModuleProbe();
  if (recheck.status !== 0) {
    if (recheck.stdout) {
      process.stdout.write(recheck.stdout);
    }
    if (recheck.stderr) {
      process.stderr.write(recheck.stderr);
    }
    throw new Error("Electron native dependencies are still incompatible after rebuild.");
  }

  saveMarker(postRebuildSignature);
}

function startElectronApp() {
  ensureElectronNativeDeps();

  const args = process.argv.slice(2);

  const child = spawn(electronPath, [".", ...args], {
    cwd: process.cwd(),
    env: buildElectronAppEnv(),
    stdio: "inherit"
  });

  child.on("error", (error) => {
    console.error("Failed to start Electron:", error);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

if (require.main === module) {
  try {
    startElectronApp();
  } catch (error) {
    console.error("Failed to prepare Electron start:", error);
    process.exit(1);
  }
}

module.exports = {
  buildDependencySignature,
  buildElectronAppEnv,
  buildElectronNodeEnv,
  ensureElectronNativeDeps,
  getElectronModuleProbeArgs,
  isTruthy,
  runElectronModuleProbe,
  startElectronApp
};
