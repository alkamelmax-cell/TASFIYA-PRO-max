const fs = require('fs/promises');
const path = require('path');
const pngToIco = require('png-to-ico').default;

const root = path.resolve(__dirname, '..');

async function writeIco(input, output) {
    const ico = await pngToIco(path.join(root, input));
    await fs.writeFile(path.join(root, output), ico);
}

Promise.all([
    writeIco('assets/icon.png', 'assets/icon.ico'),
    writeIco('assets/client-sender-icon.png', 'assets/client-sender-icon.ico')
]).then(() => {
    console.log('Windows icon files created from the supplied app-icon source.');
}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
