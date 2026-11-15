/** Build guard (D31): invented data must never reach production.
 *
 * Reads the data base this build will use:
 *  - http(s) VITE_DATA_BASE_URL (or first CLI arg): fetches
 *    orin/validation.json and orin/lots.geojson; exit 1 if any served
 *    file carries `synthetic: true` (top level or on a feature).
 *  - local folder (DATA_DIR env, default ../fixtures) or unset:
 *    only warns — dev builds legitimately use the examples.
 * Missing files are fine either way (the card simply hides).
 *
 * Usage: node scripts/check-no-synthetic.mjs [base-url]
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FILES = ["orin/validation.json", "orin/lots.geojson"];
const WEB_ROOT = resolve(import.meta.dirname, "..");
const FIXTURES = resolve(WEB_ROOT, process.env.DATA_DIR ?? "../fixtures");

/** True when a payload marks itself as invented: `synthetic: true` at
 * top level or on any geojson feature/property. */
export function isSynthetic(json) {
  if (!json || typeof json !== "object") return false;
  if (json.synthetic === true) return true;
  if (Array.isArray(json.features)) {
    return json.features.some((f) =>
      f?.synthetic === true || f?.properties?.synthetic === true);
  }
  return false;
}

/** files: [{name, found, json}] -> {bad: [...names]} of served
 * synthetic files. Callers decide warn vs fail on `remote`. */
export function assessOrinFiles(files) {
  return {
    bad: files.filter((f) => f.found && isSynthetic(f.json))
              .map((f) => f.name),
  };
}

async function fetchFile(base, name) {
  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/${name}`,
      { signal: AbortSignal.timeout(10_000) });
    if (res.status === 404) return { name, found: false, json: null };
    if (!res.ok) return { name, failed: true };
    return { name, found: true, json: await res.json() };
  } catch {
    return { name, failed: true };
  }
}

async function localFile(name) {
  try {
    return { name, found: true,
             json: JSON.parse(await readFile(
               resolve(FIXTURES, name), "utf-8")) };
  } catch {
    return { name, found: false, json: null };
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { loadEnv } = await import("vite");
  const base = process.argv[2] ??
    loadEnv("production", WEB_ROOT).VITE_DATA_BASE_URL ?? "";
  const remote = /^https?:\/\//.test(base);
  const files = await Promise.all(FILES.map((f) =>
    remote ? fetchFile(base, f) : localFile(f)));
  const { bad } = assessOrinFiles(files);
  const failed = files.filter((file) => file.failed).map((file) => file.name);

  if (failed.length) {
    console.warn(`[check-no-synthetic] aviso: no se pudieron verificar ${failed.join(", ")}.`);
  }
  if (bad.length && remote) {
    console.error(`[check-no-synthetic] FAIL: el origen remoto sirve datos ` +
      `inventados: ${bad.join(", ")}. ` +
      `Quitarlos o subir los datos reales antes de publicar.`);
    process.exitCode = 1;
  } else if (bad.length) {
    console.warn(`[check-no-synthetic] aviso: ${bad.join(", ")} llevan ` +
      `synthetic:true (OK en desarrollo local; fallaría contra http).`);
  }
}
