const fs = require("node:fs");
const path = require("node:path");

const source = path.join(__dirname, "..", "electron", "preload.cjs");
const targetDir = path.join(__dirname, "..", "dist-electron", "electron");
const target = path.join(targetDir, "preload.cjs");

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
