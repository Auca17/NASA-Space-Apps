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
   | `VITE_SITE_URL` | la URL del deploy, p. ej. `https://<proyecto>.vercel.app` | Production |

   `VITE_DATA_BASE_URL` se hornea en el build del front: apunta el lector
   de shards a R2. `DATA_BASE_URL` es la misma base pero para el backend
   (lee `field/grid`, `field/analogs`, `fire/cal`, `risk` desde allí).
   `FRONT_ORIGIN` alimenta el CORS de FastAPI. `FIRMS_MAP_KEY` es
   secreta: solo existe en Vercel, nunca en el repo.
   `VITE_SITE_URL` es opcional pero recomendada: hornea las URLs
   absolutas de canonical/hreflang/Open Graph en la landing y genera
   `sitemap.xml` y `robots.txt` con el dominio real; sin ella, esos
   archivos salen con un placeholder (`PENDIENTE-DOMINIO`).

   Variables opcionales del backend (explicaciones con IA en
   `/api/field/explain`; sin clave el endpoint usa la plantilla local):

   | nombre | valor | entorno |
   |---|---|---|
   | `AI_PROVIDER` | `gemini` (default) o `anthropic` | Production + Preview |
   | `GEMINI_API_KEY` | clave de Gemini (si provider=gemini) | Production + Preview |
   | `ANTHROPIC_API_KEY` | clave de Anthropic (si provider=anthropic) | Production + Preview |
   | `AI_MODEL` | override del modelo (opcional) | Production + Preview |

   Nota: `VITE_API_BASE` se deja vacío — las llamadas `/api/*` van al
   mismo dominio y `vercel.json` las reescribe a la función Python.

5. **Deploy**. El primer build tarda unos minutos.

## 2. Cómo queda cableado

El build de Vite es multi-página: la landing pública queda en `/`
(inglés) y `/es/` (español), y la aplicación se mueve a `/app/`.
Los rewrites de `vercel.json`, en orden:

- `POST/GET /api/*` → función Python `api/index.py` (`maxDuration: 60`),
  que importa `app.main:app` de `back/`. Dependencias: la raíz
  `requirements.txt` incluye `back/requirements.txt` (FastAPI, httpx,
  h3, pydantic, pillow, numpy, python-dotenv — ~75 MB, bajo el límite).
- `/app/*` → `web/dist/app/index.html` (la app).
- `/es/*` → `web/dist/es/index.html` (landing en español).
- `GET /` y cualquier otra ruta sin archivo estático →
  `web/dist/index.html` (landing en inglés; los archivos existentes —
  `favicon`, `robots.txt`, `sitemap.xml`, `brand/*`, `landing/*`,
  `fonts/*` — se sirven directo antes del fallback).
- El front ya compilado pide los datos directo a R2
  (`VITE_DATA_BASE_URL`); el bucket es público con `Access-Control-
  Allow-Origin: *` — no pasa por Vercel.

## 3. Verificación post-deploy

- `https://<proyecto>.vercel.app` → landing en inglés.
- `https://<proyecto>.vercel.app/es/` → landing en español.
- `https://<proyecto>.vercel.app/app/` → pantalla de bienvenida de la app.
- `https://<proyecto>.vercel.app/api/risk?lat=-33.89&lon=-60.57` → JSON.
- En el navegador (F12 → Network): `meta.json` debe venir de
  `pub-….r2.dev` con status 200.

## 4. Si hay que cambiar la versión de datos

Subir una nueva carpeta `v2/` a R2 con `tools/upload_r2.py` y cambiar
`DATA_BASE_URL` y `VITE_DATA_BASE_URL` a `…/v2/` en Vercel → Redeploy.
Las URLs versionadas permiten volver atrás sin tocar el bucket.
