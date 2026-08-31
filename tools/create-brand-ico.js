const fs = require('fs/promises');
const path = require('path');
const pngToIco = require('png-to-ico').default;

const projectRoot = path.resolve(__dirname, '..');

async function createIcon(sourceRelativePath, outputRelativePaths) {
    const sourcePath = path.join(projectRoot, sourceRelativePath);
    const ico = await pngToIco(sourcePath);

    await Promise.all(outputRelativePaths.map((outputRelativePath) => (
        fs.writeFile(path.join(projectRoot, outputRelativePath), ico)
    )));
}

async function main() {
    await createIcon('assets/icon.png', ['assets/icon.ico']);
    await createIcon('assets/client-sender-icon.png', ['assets/client-sender-icon.ico']);
    console.log('Windows ICO assets generated successfully.');
}

main().catch((error) => {
    console.error('Unable to generate Windows ICO assets:', error);
    process.exitCode = 1;
});
