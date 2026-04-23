"use strict";

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const { spawnSync } = require("child_process");

const workspaceRoot = path.resolve(__dirname, "..");
const svgPath = path.join(workspaceRoot, "assets", "logo-tasfiya-client-sender.svg");
const outputs = [
  { path: path.join(workspaceRoot, "src", "client-sender", "assets", "logo-client-sender.png"), size: 512 },
  { path: path.join(workspaceRoot, "src", "client-sender", "assets", "favicon-client-sender.png"), size: 64 },
  { path: path.join(workspaceRoot, "assets", "client-sender-icon.png"), size: 256 }
];

async function renderSvgToPng(page, svgContent, outputPath, size) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        html, body { margin: 0; background: transparent; overflow: hidden; }
        svg { width: ${size}px; height: ${size}px; display: block; }
      </style>
    </head>
    <body>${svgContent}</body>
  </html>`;

  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  const svg = await page.$("svg");
  await svg.screenshot({
    path: outputPath,
    omitBackground: true
  });
}

async function generateClientSenderBranding() {
  if (!fs.existsSync(svgPath)) {
    throw new Error(`SVG source not found: ${svgPath}`);
  }

  const svgContent = fs.readFileSync(svgPath, "utf8");
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  try {
    for (const output of outputs) {
      await renderSvgToPng(page, svgContent, output.path, output.size);
      console.log(`Generated ${path.relative(workspaceRoot, output.path)}`);
    }
  } finally {
    await browser.close();
  }

  const iconPngPath = path.join(workspaceRoot, "assets", "client-sender-icon.png");
  const iconIcoPath = path.join(workspaceRoot, "assets", "client-sender-icon.ico");
  const psScript = `
Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile('${iconPngPath.replace(/\\/g, "\\\\")}')
$icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$fileStream = [System.IO.File]::Create('${iconIcoPath.replace(/\\/g, "\\\\")}')
$icon.Save($fileStream)
$fileStream.Close()
$icon.Dispose()
$bmp.Dispose()
Write-Output '${iconIcoPath.replace(/\\/g, "\\\\")}'
  `.trim();

  const psResult = spawnSync("powershell", ["-NoProfile", "-Command", psScript], {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: "pipe",
    windowsHide: true
  });

  if (psResult.error) {
    throw psResult.error;
  }

  if (psResult.status !== 0) {
    throw new Error((psResult.stderr || psResult.stdout || "Failed to generate client sender ICO").trim());
  }

  console.log(`Generated ${path.relative(workspaceRoot, iconIcoPath)}`);
}

if (require.main === module) {
  generateClientSenderBranding().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  generateClientSenderBranding
};
