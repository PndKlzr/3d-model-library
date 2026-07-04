const { spawn } = require("node:child_process");

const VITE_URL = "http://127.0.0.1:5173";
let vite = null;
let electron = null;
let didStartElectron = false;
let isShuttingDown = false;
let ownsViteProcess = false;

void main();

async function main() {
  if (await isViteAlreadyRunning()) {
    console.log(`Existing Vite server detected at ${VITE_URL}.`);
    startElectron({ ownsVite: false });
    return;
  }

  startVite();
}

async function isViteAlreadyRunning() {
  try {
    const response = await fetch(`${VITE_URL}/`);
    return response.ok;
  } catch {
    return false;
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
      startElectron({ ownsVite: true });
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

  if (ownsViteProcess) {
    vite?.kill();
  }

  process.exit(code);
}

function startElectron({ ownsVite }) {
  ownsViteProcess = ownsVite;
  didStartElectron = true;
  electron = spawn("cmd.exe", ["/c", "npm.cmd", "exec", "electron", "."], {
    shell: false,
    stdio: "inherit"
  });
  electron.on("exit", (code) => shutdown(code ?? 0));
}
