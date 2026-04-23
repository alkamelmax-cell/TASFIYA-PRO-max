"use strict";

const path = require("path");
const { spawn } = require("child_process");
const electronPath = require("electron");

const appDir = path.join(process.cwd(), "src", "client-sender");
const args = process.argv.slice(2);
const env = { ...process.env };

delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [appDir, ...args], {
  cwd: process.cwd(),
  env,
  stdio: "inherit"
});

child.on("error", (error) => {
  console.error("Failed to start client sender Electron app:", error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
