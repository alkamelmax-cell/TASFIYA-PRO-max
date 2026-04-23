"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

function runBuild() {
  const electronBuilderBin = process.platform === "win32"
    ? path.join(process.cwd(), "node_modules", ".bin", "electron-builder.cmd")
    : path.join(process.cwd(), "node_modules", ".bin", "electron-builder");

  const args = [
    "--win",
    "--x64",
    "--config.directories.output=dist-client-sender",
    "--config.extraMetadata.main=src/client-sender/main.js",
    "--config.extraMetadata.name=tasfiya-client-sender",
    "--config.extraMetadata.description=تصفية برو - عميل إرسال طلبات التصفية",
    "--config.appId=com.tasfiyapro.clientsender",
    "--config.productName=تصفية برو - Client Sender",
    "--config.copyright=© 2025 محمد أمين الكامل - جميع الحقوق محفوظة",
    "--config.win.icon=assets/client-sender-icon.ico"
  ];
  const quotedArgs = args.map((arg) => (
    /[\s"]/u.test(arg)
      ? `"${arg.replace(/"/g, '\\"')}"`
      : arg
  ));
  const command = `"${electronBuilderBin}" ${quotedArgs.join(" ")}`;

  const result = spawnSync(
    command,
    {
      stdio: "inherit",
      shell: true,
      windowsHide: true
    }
  );

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    throw new Error(`Client sender build failed with code ${result.status}`);
  }
}

if (require.main === module) {
  try {
    runBuild();
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

module.exports = {
  runBuild
};
