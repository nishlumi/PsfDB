const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, 'psfdb.js');
const srcCode = fs.readFileSync(srcPath, 'utf8');

console.log("Reading psfdb.js...");

// Find the start of the core code inside the UMD wrapper
const startWrapper = "}(typeof self !== 'undefined' ? self : this, function () {";
const startIndex = srcCode.indexOf(startWrapper);
if (startIndex === -1) throw new Error("Start wrapper not found in psfdb.js");
const coreStart = startIndex + startWrapper.length;

// Find the end of the core code
const endWrapper = "return PsfDB;";
const endIndex = srcCode.lastIndexOf(endWrapper);
if (endIndex === -1) throw new Error("End wrapper not found in psfdb.js");

// Extract core logic
const coreCode = srcCode.substring(coreStart, endIndex).trim();

// Extract header comment
const headerIndex = srcCode.indexOf("/**");
const headerEndIndex = srcCode.indexOf("*/") + 2;
let header = "";
if (headerIndex !== -1 && headerEndIndex !== -1) {
    header = srcCode.substring(headerIndex, headerEndIndex);
}

const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
}

// 1. Generate ES Module (psfdb.esm.js)
const esmCode = `${header}

${coreCode}

export { SemanticFingerprint, PsfDB };
export default PsfDB;
`;
fs.writeFileSync(path.join(distDir, 'psfdb.esm.js'), esmCode, 'utf8');
console.log("Created dist/psfdb.esm.js");

// 2. Generate CommonJS (psfdb.cjs.js)
const cjsCode = `${header}

${coreCode}

module.exports = PsfDB;
`;
fs.writeFileSync(path.join(distDir, 'psfdb.cjs.js'), cjsCode, 'utf8');
console.log("Created dist/psfdb.cjs.js");

// 3. Generate Browser script (psfdb.browser.js)
const browserCode = `${header}

(function (root, factory) {
    root.PsfDB = factory();
}(typeof self !== 'undefined' ? self : this, function () {

${coreCode}

    return PsfDB;
}));
`;
fs.writeFileSync(path.join(distDir, 'psfdb.browser.js'), browserCode, 'utf8');
console.log("Created dist/psfdb.browser.js");

console.log("Build complete.");
