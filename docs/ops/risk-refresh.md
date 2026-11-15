# Refresh del riesgo de incendio (`clima`, Argentina)

Pipeline de una sola corrida que regenera los shards argentinos de
riesgo con datos FIRMS frescos y los publica en R2. Escrito el
2026-11-15 (task 29).

## Un comando

```bash
python tools/refresh_risk.py            # predict -> validate -> stage -> dry-run -> upload -> verify
python tools/refresh_risk.py --no-upload   # todo menos la subida (dry-run real contra el bucket NO se hace; upload_r2 en dry-run es credential-free)
python tools/refresh_risk.py --skip-predict --no-upload   # re-stagea lo que ya hay en data/processed/risk
```

Qué hace cada paso:

1. **predict** — `model/fire_risk/predict.py`: últimos 30 días de FIRMS
   (VIIRS NRT+SP), features POWER del parquet existente y climatología
   2012-2025; escribe 62 shards res-2 en `data/processed/risk/`.
2. **validate** — `back/tools/validate_contract.py data/processed`
   (contrato §2.6); cualquier error corta el pipeline.
3. **stage** — copia los `*.json` a `r2-stage-risk/` (dir limpio, en
   `.gitignore`).
4. **dry-run** — `tools/upload_r2.py r2-stage-risk --prefix v1/risk/`
   (sin credenciales, solo reporte).
5. **upload** — mismo comando con `--upload`; sync idempotente,
   resume-safe.
6. **verify** — `tools/verify_r2.py --prefix v1/risk/` (cuentas,
   faltantes, mismatches, spot check de 20 objetos) + fetch de 3 shards
   por la URL pública `DATA_BASE_URL` comparando `generated_at` y
   cantidad de celdas con el local.

## Alcance y garantías

- Solo se suben los 62 shards `level: "clima"` de Argentina que viven en
  `data/processed/risk/`. Los ~2.300 shards `historial` mundiales de
  `v1/risk/` (export de Ezequiel) **no forman parte del stage** y quedan
  intactos — `verify_r2.py` los reporta como `remote-only`.
- Secrets: `.env` (FIRMS key para predict; `R2_ACCOUNT_ID`, `R2_BUCKET`,
  `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` o `CLOUDFLARE_API_TOKEN` para
  upload; `DATA_BASE_URL` para el check público). Nunca se imprimen.
- Nota: r2.dev devuelve 403 al User-Agent por defecto de urllib; ambas
  herramientas envían uno propio.

## Verificación independiente

```bash
python tools/verify_r2.py              # v1/ completo vs fuentes locales
python tools/verify_r2.py --public     # el spot check va por la URL pública
```

## Automatización

`.github/workflows/risk-refresh.yml` existe pero está deshabilitado:
solo `workflow_dispatch` (sin schedule). Corre `refresh_risk.py
--no-upload` para revisar el dry-run en CI antes de habilitar la subida
real; los secrets usan los mismos nombres que `.env.example`.
