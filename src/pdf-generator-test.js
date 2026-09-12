const assert = require('assert');
const PDFGenerator = require('./pdf-generator');

function run() {
    const generator = new PDFGenerator();
    const bytes = Buffer.from('%PDF-1.4\nTasfiya Pro PDF test');

    const fromBuffer = generator.validatePdfOutput(bytes);
    assert(Buffer.isBuffer(fromBuffer));
    assert.strictEqual(fromBuffer.subarray(0, 5).toString('ascii'), '%PDF-');

    const typedArray = new Uint8Array(bytes);
    const fromTypedArray = generator.validatePdfOutput(typedArray);
    assert(Buffer.isBuffer(fromTypedArray));
    assert.deepStrictEqual(fromTypedArray, bytes);

    const arrayBuffer = typedArray.buffer.slice(
        typedArray.byteOffset,
        typedArray.byteOffset + typedArray.byteLength
    );
    const fromArrayBuffer = generator.validatePdfOutput(arrayBuffer);
    assert(Buffer.isBuffer(fromArrayBuffer));
    assert.deepStrictEqual(fromArrayBuffer, bytes);

    assert.throws(
        () => generator.validatePdfOutput(new Uint8Array(Buffer.from('not a pdf'))),
        /invalid document/
    );

    console.log('PDF binary normalization tests passed');
}

run();
