# Devin task 51 — R2 bucket cleanup tooling (prune what the app no longer reads, keep the rest)

Main worktree is fine (it has `data/` and `.env`). Branch: `git fetch; git checkout -B chore/r2-prune origin/main`. Edit only `tools/**`, `docs/ops/**`, `docs/data-contract.md`, `back/tests/**` for tool tests. Commit on the branch, push, never main. Never print secrets. Do not stop servers on ports 8000, 5173, 5174. **Do not run any deletion**: the R2 token currently gets `AccessDenied` on `ListObjectsV2` (it worked earlier today; do not look for other credentials, report it). The team lead will run the deletion once access is fixed.

## Decision (team lead, 2026-11-15)

The Fire and Live modes are removed from the app (another terminal does it). Remove from the bucket what nothing reads any more, and keep everything else.

## Facts already established (verify them in the code before you rely on them)

Bucket `nasa`, prefix `v1/`, 9,082 objects: `fire/cal` 2,364, `fire/daily` 2,362, `fire/points` 1,547, `globe` 313, `risk` 2,364, `field/grid` 62, `field/analogs` 62, `knowledge` 4, `orin` 2, `ecostress_demo.json`, `meta.json`. The back end reads `risk/`, `fire/cal`, `field/grid`, `field/analogs`, `knowledge/`, `orin/`, `ecostress_demo.json`, `meta.json` (via `DATA_BASE_URL`; grep `back/app`). The front read `globe/`, `fire/points`, `fire/daily` only for the removed modes. Candidates to delete: `v1/globe/`, `v1/fire/daily/`, `v1/fire/points/` (about 4,200 objects). Confirm by grepping the code on current main and on the branch `origin/feat/remove-fire-modes` if it exists; if anything else still reads a candidate prefix, drop it from the delete list and say why. `fire/cal` stays (burn season, plot fire risk) unless you prove nothing reads it.

## Build

1. `tools/prune_r2.py`: lists the objects under the delete-list prefixes (one `list_objects_v2` per prefix, with pagination), prints counts and sizes, **dry run by default**. `--delete` is required to act and additionally requires `--confirm-prefixes globe,fire/daily,fire/points` typed exactly; deletion in batches of up to 1,000 keys with `delete_objects`, retries on throttling, a JSON manifest written first (keys, sizes, ETags) to `data/prune-manifest-<date>.json` (git-ignored) so the deletion is auditable. Hard safety: refuses any prefix outside the allow-list, refuses when the keep-list is not intact (it first checks that at least one object exists under each keep prefix and aborts otherwise), and never touches keys outside `v1/`.
2. `tools/upload_r2.py`: add an `--exclude` option with the three prefixes excluded by default so a later upload of the local export can never resurrect them; tests.
3. `tools/verify_r2.py`: stop expecting the pruned prefixes (report them as "retired", and list any retired object still present remotely as a warning with the count).
4. Local staging: find where the export and stage folders are built (`r2-stage*`, `pipeline/06_export.py`, `tools/`) and make the staging skip the retired prefixes; keep the pipeline code itself. Note in `docs/ops/` which outputs are retired.
5. `docs/ops/r2-layout.md` (new): one table with every prefix still in the bucket, who reads it (file and line), size, and how to refresh it; the retired prefixes; the exact commands for the team lead: dry run, delete, verify. `docs/data-contract.md`: mark the retired outputs as retired (do not delete the history).
6. Unit tests with a stubbed S3 client (no network): dry run lists and deletes nothing, `--delete` without the confirmation fails, the allow-list guard, keep-list guard, batch splitting at 1,000, manifest written before deletion, exclude in upload. Run the whole back suite and the new tests.
7. Estimate from local sources (the export folder and `r2-stage*` if they exist) the object counts and sizes per retired prefix, so the team lead sees what will go.

## Report

The verified read map (prefix → reader), the delete list and why, the tool and its tests, the commands to run, the local estimate, and the AccessDenied status.
