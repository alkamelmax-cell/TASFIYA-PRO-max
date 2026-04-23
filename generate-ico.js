/**
 * Script to generate ICO file from PNG
 * Uses png-to-ico library
 */

const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico').default;
const puppeteer = require('puppeteer');

async function generateIco() {
    console.log('🎨 Generating icon.ico file...\n');

    const inputPath = path.join(__dirname, 'assets', 'icon.png');
    const outputPath = path.join(__dirname, 'assets', 'icon.ico');
    const tempDir = path.join(__dirname, 'assets', '.icon-sizes-tmp');

    try {
        if (!fs.existsSync(inputPath)) {
            throw new Error('assets/icon.png not found');
        }

        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Create a multi-resolution ICO for crisp taskbar / shortcuts rendering.
        const sizes = [256, 128, 64, 48, 32, 24, 16];
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        const iconPaths = [];
        for (const size of sizes) {
            const outPng = path.join(tempDir, `icon-${size}.png`);
            const html = `<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;background:transparent;">
  <canvas id="c" width="${size}" height="${size}"></canvas>
  <script>
    (async () => {
      const img = new Image();
      img.src = ${JSON.stringify('file://' + inputPath.replace(/\\/g, '/'))};
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      const c = document.getElementById('c');
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // Zoom into the central part of the logo so that
      // small taskbar sizes focus on the main icon, not the border.
      const minSide = Math.min(img.width, img.height);
      const border = minSide * 0.18; // crop ~18% from each side
      const sx = (img.width - minSide) / 2 + border;
      const sy = (img.height - minSide) / 2 + border;
      const sSize = minSide - border * 2;
      ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, c.width, c.height);
    })();
  </script>
</body>
</html>`;

            await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
            await page.setContent(html, { waitUntil: 'load' });
            await page.waitForFunction(() => true);

            const canvas = await page.$('#c');
            await canvas.screenshot({ path: outPng, omitBackground: true });
            iconPaths.push(outPng);
        }

        await browser.close();

        const buf = await pngToIco(iconPaths);
        fs.writeFileSync(outputPath, buf);
        console.log(`✅ Generated: assets/icon.ico`);
        console.log('\n🎉 ICO file generation complete!');
    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        // Best-effort cleanup of temp resized PNGs.
        try {
            if (fs.existsSync(tempDir)) {
                for (const f of fs.readdirSync(tempDir)) {
                    fs.unlinkSync(path.join(tempDir, f));
                }
                fs.rmdirSync(tempDir);
            }
        } catch (_) {
            // ignore
        }
    }
}

generateIco();
