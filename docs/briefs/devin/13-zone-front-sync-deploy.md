# Devin task 13 — Zone inference, front sync with the new engine, uploader fixes, deploy preparation (one long unit)

Tasks 11 and 12 accepted and committed (`52526fd`, `a9ebf7d`). R2 is live: bucket `nasa`, public URL `https://pub-f3e35e60ad774d339f43297a54691092.r2.dev`, data under `v1/`. Do not modify `docs/` (except where stated), `fixtures/` or secrets. Do not commit. Never print secrets (the root `.env` has `CLOUDFLARE_API_TOKEN`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `FIRMS_MAP_KEY`, `EARTHDATA_TOKEN`).

## A. The back never knows the zone (blocker)

`/api/field/rotations` needs `zone` (`pampa_humeda`, `nea`, `noa`, `cuyo`, `patagonia`, `other`), but nothing in the diagnosis returns it, so every request from the front comes back with `confidence: "low"`.

1. `/api/field/diagnose` returns a new compatible field `zone` and `province` for the plot centroid. Use an Argentine province boundary (IGN WFS you already used for departments, or Natural Earth admin-1) cached locally in the repo as a small simplified GeoJSON under `back/data/` (under 1 MB). Province to zone: pampa_humeda = Buenos Aires, CABA, Córdoba, Santa Fe, Entre Ríos, La Pampa; nea = Corrientes, Misiones, Chaco, Formosa; noa = Salta, Jujuy, Tucumán, Santiago del Estero, Catamarca, La Rioja; cuyo = Mendoza, San Juan, San Luis; patagonia = Neuquén, Río Negro, Chubut, Santa Cruz, Tierra del Fuego. Outside Argentina: `zone: "other"`, `province: null`, plus `country` when you can get it cheaply from Natural Earth admin-0 (also useful for emergency numbers).
2. `/api/field/rotations`: when `zone` is not in the request, read `diagnosis.zone`. Tests: pampa gives pampa_humeda, a Salta point gives noa, Ushuaia gives patagonia, a point in Spain gives other.
3. Add the three fields to `docs/data-contract.md` section 4.2 as compatible additions (the one doc edit allowed besides section 3.2 already done).

## B. Sync the front with the engine changes (`web/`)

1. Send `zone` from the diagnosis in the rotations request; show it in the rotation panel header ("Zona: Pampa húmeda").
2. Handle the new states: `confidence: "low"` (a visible notice explaining why), an empty `strategies` list ("sin rotaciones validadas para esta zona", plus a suggestion to talk to a local agronomist), and `strategies` with only the current rotation.
3. Irrigation: when `water_balance: "con riego"`, show `irrigation_need_mm` per crop in the benefits section with a plain sentence.
4. Show `rain_monthly_mm` as a small 12-bar chart under the rain diagnosis card (accessible: a table fallback and text summary).
5. Show `fire_weather.stop_conditions` in the field panel and in the prevention measures: which condition was exceeded, with the note "umbral por confirmar con INTA" on humidity.
6. Show indicator renames: "t/ha por año de rastrojo" and "días sin cultivo vivo".
7. Group near-identical strategies: when two alternatives share the same crops except one cereal swap (trigo and cebada), show the second as a "variante" chip inside the first card instead of a separate card, if you can detect it from the data; otherwise skip and report.
8. Tests for the new states; keep typecheck, lint and the 26 existing tests green.

## C. Uploader fixes (`tools/upload_r2.py`)

The first real upload exposed three problems; fix them in the tool so nobody needs a wrapper:

1. **Gzip JSON on upload**: files ending in `.json` are gzipped in memory and uploaded with `Content-Encoding: gzip` and `Content-Type: application/json` (the r2.dev domain does not compress). Skip comparing by MD5 for these: store the MD5 of the gzipped bytes in object metadata `x-amz-meta-src-md5` of the original, and compare against that to stay resume safe.
2. **Credentials**: if `R2_ACCESS_KEY_ID` or `R2_SECRET_ACCESS_KEY` are missing and `CLOUDFLARE_API_TOKEN` exists, derive them: Access Key ID from `GET https://api.cloudflare.com/client/v4/accounts/{R2_ACCOUNT_ID}/tokens/verify` (`result.id`) and the secret as the SHA-256 hex of the token value. Never print or store them.
3. **No 9,000 sequential HEAD calls**: replace the per-object `head_object` with one paginated `list_objects_v2` over the prefix (size and metadata comparison from the listing, plus `head_object` only for ambiguous cases). Print progress every 500 objects and a final summary. Keep `--dry-run` as the default. Update tests and `tools/README.md`.

## D. Deploy preparation (no deploy yet, there is no Vercel project)

1. One Vercel project must serve `web/` (static build) and the Python back. Design the root `vercel.json` so that: the front builds from `web/` (`npm run build`, output `web/dist`), `/api/*` goes to the Python function (keep `maxDuration` 60), and everything else falls through to the SPA `index.html`. Document the exact Vercel dashboard settings (Root Directory, Build Command, Output Directory, Install Command) and the environment variables the project needs: `FIRMS_MAP_KEY`, `DATA_BASE_URL` (`https://pub-f3e35e60ad774d339f43297a54691092.r2.dev/v1/`), `FRONT_ORIGIN`, and `VITE_DATA_BASE_URL` for the build, in `docs/DEPLOY.md` (new file, in Spanish, step by step for a person who has never used Vercel, including how to import the GitHub repo).
2. Make the Python function stay under the Vercel size limit: check `back/requirements.txt` for what the deployed API needs, split dev and test dependencies into `back/requirements-dev.txt`, and report the installed size. If the deployed API cannot reach the limit, tell me what to remove (for example pillow, numpy).
3. Run the production build locally with `VITE_DATA_BASE_URL` pointing at the R2 URL and `vite preview`, open it with a headless browser, and capture the welcome, the Corrientes panel and the pampa rotation screens against the real R2 data (not local files). Report the first-panel time on Fast 4G from R2.
4. List every cross-origin request the deployed front makes (R2, GIBS, OpenFreeMap, Nominatim) and confirm none is blocked by CORS or by a Content Security Policy.

## Report

Per section what changed, tests, the zone for the four test points, screenshots against R2, first-panel time from R2, the uploader dry-run on `data/dev_v1_gz`, and any blocker.
