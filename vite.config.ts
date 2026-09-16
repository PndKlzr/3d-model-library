import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";

function createProjectId(projectRoot: string): string {
  const canonicalRoot = realpathSync(projectRoot).toLowerCase();
  return createHash("sha256").update(canonicalRoot).digest("hex");
}

const projectId = createProjectId(process.cwd());

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "model-library-dev-identity",
      configureServer(server) {
        server.middlewares.use("/__model_library_dev_identity", (_request, response) => {
          response.statusCode = 200;
          response.setHeader("Content-Type", "text/plain; charset=utf-8");
          response.end(projectId);
        });
      }
    }
  ],
  server: {
    host: "127.0.0.1",
    port: 5173
  },
  build: {
    outDir: "dist-renderer"
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: []
  }
});
