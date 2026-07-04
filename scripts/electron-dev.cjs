const { spawn } = require("node:child_process");
const vite = spawn("cmd.exe", ["/c", "npm.cmd", "run", "dev"], {
  shell: false,
  stdio: ["ignore", "pipe", "pipe"]
});

let electron = null;
let didStartElectron = false;
let isShuttingDown = false;

const startupTimer = setTimeout(() => {
  if (!didStartElectron) {
    console.error("Vite did not become ready on http://127.0.0.1:5173 in time.");
    shutdown(1);
  }
}, 30000);

vite.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);

  if (!didStartElectron && text.includes("ready in")) {
    startElectron();
  }
});

vite.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
});

vite.on("exit", (code) => {
  if (!didStartElectron) {
    console.error("Vite exited before Electron started.");
    shutdown(code ?? 1);
  }
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function shutdown(code) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  clearTimeout(startupTimer);
  electron?.kill();
  vite.kill();
  process.exit(code);
}

function startElectron() {
  didStartElectron = true;
  clearTimeout(startupTimer);
  electron = spawn("cmd.exe", ["/c", "npm.cmd", "exec", "electron", "."], {
    shell: false,
    stdio: "inherit"
  });
  electron.on("exit", (code) => shutdown(code ?? 0));
}
