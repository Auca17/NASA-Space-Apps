import { describe, it, expect } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { assessOrinFiles, isSynthetic }
  from "./check-no-synthetic.mjs";

const SCRIPT = resolve("scripts/check-no-synthetic.mjs");

// spawn must be async: spawnSync would block this process's event
// loop and the test server would never answer the script's fetch
const run = (args: string[]) => new Promise<{
    status: number | null; out: string; err: string }>((res) => {
  const p = spawn(process.execPath, args, { encoding: "utf-8" });
  let out = "", err = "";
  p.stdout.on("data", (d) => { out += d; });
  p.stderr.on("data", (d) => { err += d; });
  p.on("close", (status) => res({ status, out, err }));
});

const serve = (body: object | null) => new Promise<{
    url: string; close: () => Promise<void> }>((res) => {
  const s: Server = createServer((_q, r) => {
    if (body == null) { r.statusCode = 404; r.end(); return; }
    r.setHeader("Content-Type", "application/json");
    r.end(JSON.stringify(body));
  }).listen(0, "127.0.0.1", () => {
    const { port } = s.address() as { port: number };
    res({ url: `http://127.0.0.1:${port}`,
          close: () => new Promise<void>((d) => s.close(() => d())) });
  });
});

describe("check-no-synthetic guard", () => {
  it("detects synthetic marks (top-level and per-feature)", () => {
    expect(isSynthetic({ synthetic: true })).toBe(true);
    expect(isSynthetic({ features: [{ properties: { synthetic: true } }] }))
      .toBe(true);
    expect(isSynthetic({ synthetic: false })).toBe(false);
  });
  it("flags only found synthetic files", () => {
    const { bad } = assessOrinFiles([
      { name: "a", found: true, json: { synthetic: true } },
      { name: "b", found: false, json: null },
      { name: "c", found: true, json: { synthetic: false } },
    ]);
    expect(bad).toEqual(["a"]);
  });
  it("exits 1 against an http base serving synthetic data", async () => {
    const s = await serve({ version: "v1", synthetic: true,
                            variables: [] });
    try {
      const r = await run([SCRIPT, s.url]);
      expect(r.status).toBe(1);
      expect(r.err).toMatch(/inventados/);
    } finally { await s.close(); }
  });
  it("passes against an http base serving real or missing files",
     async () => {
    const s = await serve({ version: "v1", synthetic: false,
                            variables: [] });
    try {
      const r = await run([SCRIPT, s.url]);
      expect(r.status).toBe(0);
    } finally { await s.close(); }
    const s2 = await serve(null);
    try {
      const r = await run([SCRIPT, s2.url]);
      expect(r.status).toBe(0);
    } finally { await s2.close(); }
  });
  it("only warns on the local fixtures base (exit 0)", () => {
    const r = spawnSync(process.execPath, [SCRIPT],
                        { encoding: "utf-8" });
    expect(r.status).toBe(0);
    expect(r.stderr + r.stdout).toMatch(/synthetic:true|aviso|warning/i);
  });
});
