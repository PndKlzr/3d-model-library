const path = require("node:path");
const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");

const runtimeRoots = [
  "/package.json",
  "/dist-electron",
  "/dist-renderer",
  "/node_modules",
];

function ignoreNonRuntimeFiles(filePath) {
  const normalizedPath = filePath.replaceAll("\\", "/");
  if (!normalizedPath) return false;

  return !runtimeRoots.some(
    (runtimeRoot) =>
      normalizedPath === runtimeRoot || normalizedPath.startsWith(`${runtimeRoot}/`),
  );
}

module.exports = {
  packagerConfig: {
    asar: true,
    prune: true,
    name: "3D Model Library",
    executableName: "3D Model Library",
    icon: path.resolve(__dirname, "assets", "app-icon"),
    ignore: ignoreNonRuntimeFiles,
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "model_library",
        setupExe: "3D-Model-Library-Setup.exe",
        setupIcon: path.resolve(__dirname, "assets", "app-icon.ico"),
      },
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["win32"],
    },
  ],
  plugins: [
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
