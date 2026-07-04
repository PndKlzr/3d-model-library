const { spawn } = require("node:child_process");
const http = require("node:http");

const vite = spawn("cmd.exe", ["/c", "npm.cmd", "run", "dev"], {
  shell: false,
  stdio: "inherit"
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

const pollTimer = setInterval(() => {
  if (didStartElectron) {
    return;
  }

  const request = http.get("http://127.0.0.1:5173", (response) => {
    response.resume();
    didStartElectron = true;
    clearInterval(pollTimer);
    clearTimeout(startupTimer);
    electron = spawn("cmd.exe", ["/c", "npm.cmd", "exec", "electron", "."], {
      shell: false,
      stdio: "inherit"
    });
    electron.on("exit", (code) => shutdown(code ?? 0));
  });

  request.on("error", () => undefined);
  request.setTimeout(1000, () => request.destroy());
}, 250);

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
  clearInterval(pollTimer);
  clearTimeout(startupTimer);
  electron?.kill();
  vite.kill();
  process.exit(code);
}
