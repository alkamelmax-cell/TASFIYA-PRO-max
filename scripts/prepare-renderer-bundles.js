"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const buildScriptPath = path.join(__dirname, "build-renderer-bundles.js");
const requiredEntryFiles = [
  path.join(projectRoot, "src", "app.js"),
  path.join(projectRoot, "src", "customer-ledger.js"),
  path.join(projectRoot, "src", "supplier-ledger.js"),
  path.join(projectRoot, "src", "cashboxes.js"),
  path.join(projectRoot, "src", "reconciliation-requests-manager.js")
];

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function isWebDeploymentEnvironment(env = process.env) {
  return isTruthy(env.FORCE_WEB_SERVER)
    || isTruthy(env.RENDER)
    || Boolean(env.RENDER_SERVICE_ID)
    || Boolean(env.RENDER_EXTERNAL_URL)
    || Boolean(env.RENDER_EXTERNAL_HOSTNAME)
    || Boolean(env.RENDER_GIT_COMMIT)
    || Boolean(env.DATABASE_URL)
    || Boolean(env.PORT);
}

function listMissingFiles(filePaths) {
  return filePaths.filter((filePath) => !fs.existsSync(filePath));
}

function getSkipReason(env = process.env) {
  if (isWebDeploymentEnvironment(env)) {
    return "Skipping desktop renderer bundle build in web deployment environment.";
  }

  if (!fs.existsSync(buildScriptPath)) {
    return "Renderer bundle builder script is not present in this checkout. Skipping bundle build.";
  }

  const missingEntries = listMissingFiles(requiredEntryFiles);
  if (missingEntries.length > 0) {
    const formatted = missingEntries.map((filePath) => path.relative(projectRoot, filePath).replace(/\\/g, "/"));
    return `Renderer bundle entry files are missing (${formatted.join(", ")}). Skipping bundle build.`;
  }

  return "";
}

function runRendererBundlePreparation(options = {}) {
  const env = options.env || process.env;
  const stdio = options.stdio || "inherit";
  const skipReason = getSkipReason(env);

  if (skipReason) {
    console.log(`ℹ️ [RENDERER] ${skipReason}`);
    return 0;
  }

  const result = spawnSync(process.execPath, [buildScriptPath], {
    cwd: projectRoot,
    env,
    stdio
  });

  if (result.error) {
    throw result.error;
  }

  return typeof result.status === "number" ? result.status : 0;
}

if (require.main === module) {
  try {
    const exitCode = runRendererBundlePreparation();
    process.exit(exitCode);
  } catch (error) {
    console.error("Failed to prepare renderer bundles:", error);
    process.exit(1);
  }
}

module.exports = {
  buildScriptPath,
  getSkipReason,
  isTruthy,
  isWebDeploymentEnvironment,
  requiredEntryFiles,
  runRendererBundlePreparation
};
