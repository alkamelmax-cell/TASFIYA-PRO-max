"use strict";

const { spawn } = require("child_process");
const electronPath = require("electron");

const args = process.argv.slice(2);
const env = { ...process.env };

// Force Electron app mode even if parent process injects this variable.
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [".", ...args], {
  cwd: process.cwd(),
  env,
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
