# tools/

## upload_r2.py — local folders to Cloudflare R2

    python tools/upload_r2.py <local_dir> [--prefix v1/] [--upload]

Default is a credential-free `--dry-run` (counts and total bytes only).
`--upload` performs the sync through the S3 API
(`https://<account>.r2.cloudflarestorage.com`) with 16 workers. The
remote diff is one paginated `list_objects_v2` over the prefix (no
per-object HEAD storm); a `.json` whose stored size matches but whose
ETag differs falls back to a single `head_object` comparing the
`src-md5` metadata, so reruns stay resume-safe. Progress prints every
500 objects.

Encoding: `.json` files are gzipped in memory (`application/json` +
`Content-Encoding: gzip`) because r2.dev does not compress; already
gzipped `.json` (e.g. `data/dev_v1_gz`) is sent untouched. The MD5 of
the original JSON is stored in object metadata `x-amz-meta-src-md5`.
`.csv.gz` goes up as `text/csv` + `Content-Encoding: gzip`.
All objects get `Cache-Control: public, max-age=3600`.

Credentials: `R2_ACCOUNT_ID`, `R2_BUCKET` plus either the
`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` pair or just
`CLOUDFLARE_API_TOKEN` — with the token the tool derives the pair
itself (key id from the Cloudflare tokens/verify endpoint, secret =
SHA-256 hex of the token; never printed or stored).

### Folder -> prefix mapping

| local folder | R2 prefix |
|---|---|
| `data/processed/export/v1/` (Ezequiel's export: `meta.json`, `globe/`, `fire/`, `risk/` historial) | `v1/` |
| `data/processed/field/grid` | `v1/field/grid` |
| `data/processed/field/analogs` | `v1/field/analogs` |
| `data/processed/risk` | `v1/risk` |

Important ordering: Ezequiel's `risk/` shards (`level: "historial"`)
and Devin's `risk/` shards (`level: "clima"`) share the same
`v1/risk/{h3_r2}.json` keys. Upload Ezequiel's export first and the
Argentine `clima` shards **last**, so the live-model cells win on
overlap. The two producers should ideally agree on which level each
res-2 shard carries before uploading; today both write Argentina
shards and the later upload silently overwrites the earlier one.

## refresh_risk.py — regenerate + publish AR clima risk shards

    python tools/refresh_risk.py [--no-upload] [--skip-predict]

One command: `predict.py` (fresh FIRMS) -> contract validation ->
stage into `r2-stage-risk/` -> `upload_r2.py` dry-run -> `--upload` ->
`verify_r2.py --prefix v1/risk/` + public-URL fetch of 3 shards.
`--no-upload` stops after the dry-run. Only the Argentine `clima`
shards are staged; worldwide `historial` objects under `v1/risk/` are
untouched. See `docs/ops/risk-refresh.md`.

## verify_r2.py — published v1/ tree vs local sources

    python tools/verify_r2.py [--prefix v1/] [--spot 20] [--public]

Lists the bucket under `v1/`, reconciles remote objects against the
local canonical sources (`export/v1` if present, `data/processed/field`,
`data/processed/risk`, `back/knowledge/*.json`, `data/processed/orin`,
`ecostress_demo.json`, plus `data/dev_v1` as the published mirror) and
reports per-prefix counts, remote-missing objects, size/content
mismatches (gzipped stored size + `src-md5` metadata), remote-only
objects, and a 20-object download+parse spot check. `--public` fetches
the spot check through `DATA_BASE_URL`. Exit code is non-zero when
anything is missing, mismatched, or fails to parse. Note: r2.dev 403s
urllib's default User-Agent; the tool sends its own.

## audit_data.py — data sanity audit for published shards

    python tools/audit_data.py [--live]

Audits `data/processed/field/grid`, `data/processed/risk` and
`data/processed/field/analogs`: per-field min/p1/median/p99/max/null
shares, range checks (negative rain, frost-free > 365, hot > 366,
elevation outside -50..7000, |temp_adjust| > 15, AR rain < 20 or > 5000,
bare soil > 366, crop cells with zero bare days, unknown textures) with
the five worst cells per check, risk distribution by category/province
and analog cluster sanity. `--live` additionally cross-checks
stratified sample cells against the on-demand diagnose API (needs a
backend running with `DATA_BASE_URL` pointing at the data under test).
Findings live in `docs/audit/data-audit.md`.
