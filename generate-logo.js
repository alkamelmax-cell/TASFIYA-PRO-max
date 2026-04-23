/**
 * Script to generate TASFIA PRO logo in all required formats
 * Uses Puppeteer to convert SVG to PNG
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Logo sizes needed
const sizes = [
    { name: 'logo-tasfia-pro.png', size: 512, folder: 'src/web-dashboard/assets' },
    { name: 'icon-512.png', size: 512, folder: 'src/web-dashboard/assets' },
    { name: 'icon-192.png', size: 192, folder: 'src/web-dashboard/assets' },
    { name: 'favicon.png', size: 64, folder: 'src/web-dashboard/assets' },
    { name: 'icon.png', size: 256, folder: 'assets' },
];

async function generateLogo() {
    console.log('🎨 Generating TASFIA PRO logo...\n');

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // Read SVG file
    const svgPath = path.join(__dirname, 'assets', 'logo-tasfia-pro.svg');
    const svgContent = fs.readFileSync(svgPath, 'utf8');

    for (const config of sizes) {
        const outputPath = path.join(__dirname, config.folder, config.name);

        // Ensure folder exists
        const folder = path.dirname(outputPath);
        if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder, { recursive: true });
        }

        // Create HTML with SVG scaled to size
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { margin: 0; background: transparent; }
                    svg { width: ${config.size}px; height: ${config.size}px; }
                </style>
            </head>
            <body>
                ${svgContent}
            </body>
            </html>
        `;

        await page.setContent(html);
        await page.setViewport({ width: config.size, height: config.size });

        // Take screenshot
        const element = await page.$('svg');
        await element.screenshot({
            path: outputPath,
            omitBackground: true
        });

        console.log(`✅ Generated: ${path.relative(__dirname, outputPath)} (${config.size}x${config.size})`);
    }

    await browser.close();

    console.log('\n🎉 Logo generation complete!');
    console.log('\n📁 Files created:');
    sizes.forEach(s => {
        console.log(`   • ${s.folder}/${s.name}`);
    });
}

// Run generation
generateLogo().catch(err => {
    console.error('❌ Error generating logo:', err);
    process.exit(1);
});
