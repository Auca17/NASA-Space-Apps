# Deploy en Vercel — paso a paso

Un solo proyecto de Vercel sirve el front (`web/`, build estático) y el
backend Python (`api/index.py`, función serverless). Los datos viven en
Cloudflare R2 (`https://pub-f3e35e60ad774d339f43297a54691092.r2.dev/v1/`).

## 1. Crear el proyecto

1. Entrar a <https://vercel.com> y registrarse con la cuenta de GitHub.
2. **Add New → Project → Import Git Repository**: elegir este repo.
   Si no aparece, "Adjust GitHub App Permissions" y dar acceso.
3. En la pantalla de configuración, dejar **Root Directory** en la
   raíz del repo (`./`). Vercel lee `vercel.json` y no hace falta
   tocar nada más, pero verificar:
   - **Framework Preset:** *Other* (Vercel lo detecta como Vite o
     Other; cualquiera sirve porque el comando es explícito).
   - **Build Command:** `cd web && npm run build`
   - **Output Directory:** `web/dist`
   - **Install Command:** `cd web && npm install`
4. **Environment Variables** (pestaña Environment Variables):

   | nombre | valor | entorno |
   |---|---|---|
   | `FIRMS_MAP_KEY` | la clave FIRMS del `.env` local | Production + Preview |
   | `DATA_BASE_URL` | `https://pub-f3e35e60ad774d339f43297a54691092.r2.dev/v1/` | Production + Preview |
   | `FRONT_ORIGIN` | la URL del deploy, p. ej. `https://<proyecto>.vercel.app` | Production |
   | `VITE_DATA_BASE_URL` | `https://pub-f3e35e60ad774d339f43297a54691092.r2.dev/v1/` | Production + Preview |

   `VITE_DATA_BASE_URL` se hornea en el build del front: apunta el lector
   de shards a R2. `DATA_BASE_URL` es la misma base pero para el backend
   (lee `field/grid`, `field/analogs`, `fire/cal`, `risk` desde allí).
   `FRONT_ORIGIN` alimenta el CORS de FastAPI. `FIRMS_MAP_KEY` es
   secreta: solo existe en Vercel, nunca en el repo.

   Nota: `VITE_API_BASE` se deja vacío — las llamadas `/api/*` van al
   mismo dominio y `vercel.json` las reescribe a la función Python.

5. **Deploy**. El primer build tarda unos minutos.

## 2. Cómo queda cableado

- `GET /` y cualquier ruta sin archivo estático → `web/dist/index.html`
  (fallback SPA, último rewrite de `vercel.json`).
- `POST/GET /api/*` → función Python `api/index.py` (`maxDuration: 60`),
  que importa `app.main:app` de `back/`. Dependencias: la raíz
  `requirements.txt` incluye `back/requirements.txt` (FastAPI, httpx,
  h3, pydantic, pillow, numpy, python-dotenv — ~75 MB, bajo el límite).
- El front ya compilado pide los datos directo a R2
  (`VITE_DATA_BASE_URL`); el bucket es público con `Access-Control-
  Allow-Origin: *` — no pasa por Vercel.

## 3. Verificación post-deploy

- `https://<proyecto>.vercel.app` → pantalla de bienvenida.
- `https://<proyecto>.vercel.app/api/risk?lat=-33.89&lon=-60.57` → JSON.
- En el navegador (F12 → Network): `meta.json` debe venir de
  `pub-….r2.dev` con status 200.

## 4. Si hay que cambiar la versión de datos

Subir una nueva carpeta `v2/` a R2 con `tools/upload_r2.py` y cambiar
`DATA_BASE_URL` y `VITE_DATA_BASE_URL` a `…/v2/` en Vercel → Redeploy.
Las URLs versionadas permiten volver atrás sin tocar el bucket.
