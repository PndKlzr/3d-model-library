const { readdir, rm } = require("node:fs/promises");
const path = require("node:path");

function shouldRemovePackageFile(relativePath) {
  return path.extname(relativePath).toLowerCase() === ".map";
}

async function prunePackageFiles({ buildPath }) {
  const pending = [buildPath];

  while (pending.length > 0) {
    const directory = pending.pop();
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolutePath);
      } else if (entry.isFile() && shouldRemovePackageFile(path.relative(buildPath, absolutePath))) {
        await rm(absolutePath, { force: true });
      }
    }
  }
}

module.exports = { prunePackageFiles, shouldRemovePackageFile };
