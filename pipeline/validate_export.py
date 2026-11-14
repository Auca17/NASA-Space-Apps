"""Valida data/processed/export/v1 contra el contrato, en paralelo.

Usa la misma función `_check` de back/tools/validate_contract.py (mismas reglas),
repartiendo los archivos entre todos los núcleos. El validador original procesa
un archivo por vez y con ~1,4 GB de JSON tarda más de 2 horas.

Uso:  python pipeline/validate_export.py [carpeta]
"""

from __future__ import annotations

import os
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "back" / "tools"))
import validate_contract as vc  # noqa: E402

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / "data" / "processed" / "export" / "v1"


def check(path: str):
    p = Path(path)
    rel = str(p.relative_to(ROOT))
    return rel, vc._check(rel, p.read_bytes())


def main():
    files = sorted(str(p) for p in ROOT.rglob("*") if p.is_file())
    # los más pesados primero, para repartir mejor la carga
    files.sort(key=lambda f: -os.path.getsize(f))
    fails = ok = skip = 0
    with ProcessPoolExecutor(max_workers=os.cpu_count()) as ex:
        for rel, err in ex.map(check, files, chunksize=4):
            if err == "SKIP":
                skip += 1
            elif err:
                fails += 1
                print(f"FAIL {rel}: {err}", flush=True)
            else:
                ok += 1
    print(f"--- {ok} ok, {skip} skip, {fails} error(s) sobre {len(files)} archivos")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
