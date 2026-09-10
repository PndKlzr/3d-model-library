const { mkdir, mkdtemp, rm, stat } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const SCENARIOS = new Set(["cold", "warm", "scroll"]);

function parseArguments(args) {
  let library;
  let scenario;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--library") library = args[++index];
    else if (argument === "--scenario") scenario = args[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }

  if (!library) throw new Error("--library is required");
  if (!path.isAbsolute(library)) throw new Error("--library must be absolute");
  if (!scenario) throw new Error("--scenario is required");
  if (!SCENARIOS.has(scenario)) {
    throw new Error("--scenario must be one of: cold, warm, scroll");
  }

  return { library: path.resolve(library), scenario };
}

async function run(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const libraryStat = await stat(options.library);
  if (!libraryStat.isDirectory()) throw new Error("--library must identify a directory");

  const outputDirectory = path.resolve(process.cwd(), "benchmark-results");
  const output = path.join(outputDirectory, `thumbnail-${options.scenario}-${Date.now()}.json`);
  const userData = await mkdtemp(path.join(os.tmpdir(), "model-library-benchmark-"));
  await mkdir(outputDirectory, { recursive: true });

  try {
    await spawnElectron({ ...options, output, userData });
    await stat(output);
    process.stdout.write(`${output}\n`);
  } finally {
    await rm(userData, { recursive: true, force: true });
  }
}

function spawnElectron({ library, scenario, output, userData }) {
  const electronPath = require("electron");
  const mainPath = path.resolve(process.cwd(), "dist-electron", "electron", "main.js");
  const child = spawn(electronPath, [mainPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      MODEL_LIBRARY_BENCHMARK_ROOT: library,
      MODEL_LIBRARY_BENCHMARK_SCENARIO: scenario,
      MODEL_LIBRARY_BENCHMARK_OUTPUT: output,
      MODEL_LIBRARY_BENCHMARK_USER_DATA: userData
    },
    stdio: "inherit"
  });

  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Electron benchmark failed (${signal ?? code})`));
    });
  });
}

module.exports = { parseArguments, run };

if (require.main === module) {
  run().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
