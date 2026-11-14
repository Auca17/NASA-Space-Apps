# tools/

## upload_r2.py — local folders to Cloudflare R2

    python tools/upload_r2.py <local_dir> [--prefix v1/] [--upload]

Default is a credential-free `--dry-run` (counts and total bytes only).
`--upload` performs the sync through the S3 API
(`https://<account>.r2.cloudflarestorage.com`) with 16 workers, skipping
objects whose size and MD5 already match (safe to resume). Credentials:
`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
from the environment or the repo-root `.env`.

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
