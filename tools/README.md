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
