/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { join, resolve, extname, sep } from "node:path";
import { gzipSync } from "node:zlib";
import type { IncomingMessage, ServerResponse } from "node:http";

// DATA_DIR env points the /data/v1/ middleware at any contract folder:
// fixtures (default), ../data/dev_v1, or a mirror of R2 v1/.
const DATA_DIR = process.env.DATA_DIR ?? "../fixtures";
const FIXTURES = resolve(import.meta.dirname, DATA_DIR);
const DATA_PREFIX = "/data/v1/";

const MIME: Record<string, string> = {
  ".json": "application/json",
  ".gz": "application/gzip",
  ".csv": "text/csv",
};

function handler(req: IncomingMessage, res: ServerResponse) {
  const rel = decodeURIComponent(
    (req.url ?? "/").split("?")[0]).replace(/^\/+/, "");
  const file = join(FIXTURES, rel);
  if (!file.startsWith(FIXTURES + sep) ||
      !existsSync(file) || !statSync(file).isFile()) {
    res.statusCode = 404;
    res.end("not found");
    return;
  }
  res.setHeader("Content-Type",
    MIME[extname(file)] ?? "application/octet-stream");
  // gzip JSON like Cloudflare does at the edge for R2 buckets
  const wantGzip = /\bgzip\b/.test(
    String(req.headers["accept-encoding"] ?? "")) &&
    extname(file) === ".json";
  if (wantGzip) res.setHeader("Content-Encoding", "gzip");
  readFile(file).then(
    (buf: Buffer) => res.end(wantGzip ? gzipSync(buf) : buf),
    () => {
      res.statusCode = 500;
      res.end();
    });
}

/** Read-only middleware: /data/v1/* -> DATA_DIR (dev + preview). */
function fixturesMiddleware(): Plugin {
  const mount = (middlewares: { use: (p: string,
      h: typeof handler) => void }) =>
    middlewares.use(DATA_PREFIX.slice(0, -1), handler);
  return {
    name: "fixtures-static",
    configureServer(server) { mount(server.middlewares); },
    configurePreviewServer(server) { mount(server.middlewares); },
  };
}

export default defineConfig({
  plugins: [react(), fixturesMiddleware()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ["maplibre-gl"],
          plot: ["@observablehq/plot"],
          h3: ["h3-js"],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
