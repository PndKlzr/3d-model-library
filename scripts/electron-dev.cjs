const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const { appendFileSync, existsSync, mkdirSync, realpathSync, renameSync, rmSync, statSync } = require("node:fs");
const path = require("node:path");

const VITE_URL = "http://127.0.0.1:5173";
const PROJECT_ID = createProjectId(process.cwd());
const MAX_LOG_BYTES = 1024 * 1024;
const diagnosticDirectory = path.join(process.env.APPDATA ?? process.cwd(), "model-library", "logs");
const diagnosticLogPath = path.join(diagnosticDirectory, "development.log");
const previousDiagnosticLogPath = path.join(diagnosticDirectory, "development.previous.log");
let vite = null;
let electron = null;
let didStartElectron = false;
let isShuttingDown = false;
let ownsViteProcess = false;

mkdirSync(diagnosticDirectory, { recursive: true });
writeDiagnostic("launcher", `\n=== Session ${new Date().toISOString()} | ${process.cwd()} ===\n`);

void main();

async function main() {
  const runningProjectId = await getRunningProjectId();
  if (runningProjectId === PROJECT_ID) {
    console.log(`Existing project Vite server detected at ${VITE_URL}.`);
    startElectron();
    return;
  }
  if (runningProjectId) {
    console.error("Refusing to reuse a Vite server from another checkout.");
    process.exitCode = 1;
    return;
  }

  startVite();
}

function createProjectId(projectRoot) {
  const canonicalRoot = realpathSync(projectRoot).toLowerCase();
  return createHash("sha256").update(canonicalRoot).digest("hex");
}

function writeDiagnostic(source, value) {
  const text = String(value).replace(/\x1b\[[0-9;]*m/g, "");
  const entry = `[${new Date().toISOString()}] [${source}] ${text}`;

  try {
    if (existsSync(diagnosticLogPath)
        && statSync(diagnosticLogPath).size + Buffer.byteLength(entry) > MAX_LOG_BYTES) {
      rmSync(previousDiagnosticLogPath, { force: true });
      renameSync(diagnosticLogPath, previousDiagnosticLogPath);
    }
    appendFileSync(diagnosticLogPath, entry, "utf8");
  } catch {
    // Diagnostics must never prevent the application from opening.
  }
}

async function getRunningProjectId() {
  try {
    const response = await fetch(`${VITE_URL}/__model_library_dev_identity`, {
      signal: AbortSignal.timeout(1_000)
    });
    return response.ok ? (await response.text()).trim() : null;
  } catch {
    return null;
  }
}

function startVite() {
  ownsViteProcess = true;
  vite = spawn("cmd.exe", ["/c", "npm.cmd", "run", "dev"], {
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });

  const startupTimer = setTimeout(() => {
    if (!didStartElectron) {
      console.error(`Vite did not become ready on ${VITE_URL} in time.`);
      shutdown(1);
    }
  }, 30000);

  vite.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);

    if (!didStartElectron && text.includes("ready in")) {
      clearTimeout(startupTimer);
      startElectron();
    }
  });

  vite.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  vite.on("exit", (code) => {
    clearTimeout(startupTimer);

    if (!didStartElectron) {
      console.error("Vite exited before Electron started.");
      shutdown(code ?? 1);
    }
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function shutdown(code) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  electron?.kill();
  if (ownsViteProcess) vite?.kill();

  process.exit(code);
}

function startElectron() {
  didStartElectron = true;
  electron = spawn("cmd.exe", ["/c", "npm.cmd", "exec", "electron", "."], {
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      MODEL_LIBRARY_DEV_SERVER_URL: VITE_URL
    }
  });
  electron.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    writeDiagnostic("electron:out", chunk);
  });
  electron.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
    writeDiagnostic("electron:err", chunk);
  });
  electron.on("exit", (code) => shutdown(code ?? 0));
}
