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

// Public site base for canonical/hreflang/OG tags and sitemap.xml.
// Set VITE_SITE_URL at build time (e.g. https://example.vercel.app);
// unset keeps canonical URLs root-relative and sitemap uses a relative
// placeholder noted in docs/DEPLOY.md.
const SITE_URL = (process.env.VITE_SITE_URL ?? "").replace(/\/+$/, "");

/** Multi-page build: landing at / and /es/, app at /app/. The html
 * transform stamps %SITE_URL%; the emitter writes sitemap/robots on
 * build only (emitFile is not supported in serve mode). */
function landingSite(): Plugin[] {
  const PAGES = ["/", "/es/", "/app/"];
  const html: Plugin = {
    name: "landing-site:html",
    transformIndexHtml(h) {
      return h.replaceAll("%SITE_URL%", SITE_URL);
    },
  };
  const emit: Plugin = {
    name: "landing-site:emit",
    apply: "build",
    generateBundle() {
      const base = SITE_URL || "PENDIENTE-DOMINIO";
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        PAGES.map((p) => `  <url><loc>${base}${p}</loc></url>\n`).join("") +
        `</urlset>\n`;
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: xml,
      });
      const robots = `User-agent: *\nAllow: /\n` +
        (SITE_URL ? `Sitemap: ${SITE_URL}/sitemap.xml\n` : "");
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: robots,
      });
    },
  };
  return [html, emit];
}

export default defineConfig({
  plugins: [react(), fixturesMiddleware(), landingSite()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        es: resolve(import.meta.dirname, "es/index.html"),
        app: resolve(import.meta.dirname, "app/index.html"),
      },
      output: {
        manualChunks: {
          maplibre: ["maplibre-gl"],
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
