const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");

const SCENARIOS = new Set(["cold", "warm", "scroll"]);
const DEFAULT_TIMEOUT_MS = 20 * 60_000;
const DEFAULT_TERMINATION_GRACE_MS = 5_000;

class BenchmarkProcessExitUnconfirmedError extends Error {
  constructor(timeoutMs) {
    super(
      `Electron benchmark timed out after ${timeoutMs}ms and process exit could not be confirmed`
    );
    this.name = "BenchmarkProcessExitUnconfirmedError";
    this.childExitConfirmed = false;
  }
}

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

async function run(args = process.argv.slice(2), overrides = {}) {
  const dependencies = {
    cwd: process.cwd(),
    tmpdir: os.tmpdir(),
    now: Date.now,
    realpath: fs.realpath,
    stat: fs.stat,
    mkdir: fs.mkdir,
    mkdtemp: fs.mkdtemp,
    rm: fs.rm,
    spawnElectron,
    ...overrides
  };
  const parsed = parseArguments(args);
  const library = await dependencies.realpath(parsed.library);
  const libraryStat = await dependencies.stat(library);
  if (!libraryStat.isDirectory()) throw new Error("--library must identify a directory");

  const canonicalCwd = await dependencies.realpath(dependencies.cwd);
  const canonicalTempRoot = await dependencies.realpath(dependencies.tmpdir);
  const outputDirectory = await canonicalizePotentialPath(
    path.join(canonicalCwd, "benchmark-results"),
    dependencies.realpath
  );
  assertOutsideLibrary(library, outputDirectory, "benchmark output");
  assertOutsideLibrary(library, canonicalTempRoot, "temporary user data");

  const output = path.join(
    outputDirectory,
    `thumbnail-${parsed.scenario}-${dependencies.now()}.json`
  );
  let userData;
  let cleanupUserData = true;

  try {
    userData = await dependencies.mkdtemp(
      path.join(canonicalTempRoot, "model-library-benchmark-")
    );
    await dependencies.mkdir(outputDirectory, { recursive: true });
    await dependencies.spawnElectron({
      library,
      scenario: parsed.scenario,
      output,
      userData
    });
    await dependencies.stat(output);
    process.stdout.write(`${output}\n`);
  } catch (error) {
    if (error?.childExitConfirmed === false) cleanupUserData = false;
    throw error;
  } finally {
    if (userData && cleanupUserData) {
      await dependencies.rm(userData, { recursive: true, force: true });
    }
  }
}

async function canonicalizePotentialPath(candidate, realpath) {
  try {
    return await realpath(candidate);
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
    const parent = path.dirname(candidate);
    if (parent === candidate) throw error;
    return path.join(await canonicalizePotentialPath(parent, realpath), path.basename(candidate));
  }
}

function assertOutsideLibrary(library, candidate, label) {
  const relative = path.relative(library, candidate);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error(`${label} must be outside the library`);
  }
}

function spawnElectron({ library, scenario, output, userData }, overrides = {}) {
  const spawn = overrides.spawn ?? childProcess.spawn;
  const timeoutMs = overrides.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const terminationGraceMs = overrides.terminationGraceMs ?? DEFAULT_TERMINATION_GRACE_MS;
  const electronPath = overrides.electronPath ?? require("electron");
  const appPath = overrides.appPath ?? process.cwd();
  const child = spawn(electronPath, [appPath], {
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
    let settled = false;
    let timeoutError = null;
    let escalationTimer;
    let exitConfirmationTimer;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      clearTimeout(escalationTimer);
      clearTimeout(exitConfirmationTimer);
      if (error) reject(error);
      else resolve();
    };
    const watchdog = setTimeout(() => {
      timeoutError = new Error(`Electron benchmark timed out after ${timeoutMs}ms`);
      child.kill();
      escalationTimer = setTimeout(() => {
        child.kill("SIGKILL");
        exitConfirmationTimer = setTimeout(() => {
          finish(new BenchmarkProcessExitUnconfirmedError(timeoutMs));
        }, terminationGraceMs);
        exitConfirmationTimer.unref?.();
      }, terminationGraceMs);
      escalationTimer.unref?.();
    }, timeoutMs);
    watchdog.unref?.();

    child.once("error", (error) => {
      if (!timeoutError) finish(error);
    });
    child.once("exit", (code, signal) => {
      if (timeoutError) finish(timeoutError);
      else if (code === 0) finish();
      else finish(new Error(`Electron benchmark failed (${signal ?? code})`));
    });
  });
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TERMINATION_GRACE_MS,
  BenchmarkProcessExitUnconfirmedError,
  parseArguments,
  run,
  spawnElectron
};

if (require.main === module) {
  run().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
