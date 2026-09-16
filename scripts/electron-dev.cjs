const { spawn } = require("node:child_process");
const net = require("node:net");

let vite = null;
let electron = null;
let didStartElectron = false;
let isShuttingDown = false;
let vitePort = 0;
let viteUrl = "";

void main();

async function main() {
  vitePort = await findAvailablePort();
  viteUrl = `http://127.0.0.1:${vitePort}`;
  startVite();
}

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function startVite() {
  vite = spawn(
    "cmd.exe",
    ["/c", "npm.cmd", "run", "dev", "--", "--port", String(vitePort)],
    {
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
    }
  );

  const startupTimer = setTimeout(() => {
    if (!didStartElectron) {
      console.error(`Vite did not become ready on ${viteUrl} in time.`);
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
  vite?.kill();

  process.exit(code);
}

function startElectron() {
  didStartElectron = true;
  electron = spawn("cmd.exe", ["/c", "npm.cmd", "exec", "electron", "."], {
    shell: false,
    stdio: "inherit",
    env: {
      ...process.env,
      MODEL_LIBRARY_DEV_SERVER_URL: viteUrl
    }
  });
  electron.on("exit", (code) => shutdown(code ?? 0));
}
