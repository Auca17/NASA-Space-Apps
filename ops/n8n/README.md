# Flujos de n8n de Ashfield

Flujos para importar en n8n (Workflows → menú ⋯ → Import from file). No traen credenciales ni teléfonos reales: se completan en n8n.

Canal para la demo: **email por Gmail** (`11`–`13`). Se conecta en n8n con la credencial *Gmail OAuth2* («Sign in with Google»), sin contraseñas en `.env`.

Por qué no WhatsApp todavía (2026-11-15):

- **Meta WhatsApp Cloud API** (plan original, `docs/ops/n8n-whatsapp-setup.md`): Facebook bloqueó la creación de la app («dispositivo no habitual»). Hace falta una cuenta de Facebook establecida para crear la app de Meta.
- **Twilio (prueba gratis)**: el número de prueba (+1 737 250 8034) solo manda las plantillas de ejemplo de Twilio (error `21654 ContentSid Required`), y crear plantillas propias exige cuenta paga (error `20003`). Además el destinatario tiene que estar verificado, y Twilio lo registra sin el 9 (`+54 261…`).

Los flujos `01`–`03` (WhatsApp por Twilio) quedan para cuando haya cuenta paga o de Meta: cambia solo el nodo de envío.

| Archivo | Qué hace | Qué completar después de importar |
|---|---|---|
| `11-email-smoke.json` | Botón → manda un email de prueba | Credencial Gmail; tu email en *To* |
| `12-alerta-fuego-email.json` | Cada 3 h (o «Probar ahora»): focos nuevos de `/api/live` dentro del radio de cada campo → email | En **Suscripciones**: `API_BASE`, el email y el campo; credencial Gmail |
| `14-aviso-campo-email.json` | Webhook `POST /aviso-campo` con `{ to, subject, html, text }` que arma el back end (`POST /api/alerts/test`, botón «Mandarme un mail de prueba» de la app) → email por Gmail. Cubre todos los fenómenos: fuego, sequía, heladas, calor, nieve, granizo, El Niño / La Niña y anegamiento | Credencial **Header Auth** (`X-Ashfield-Secret`) y credencial Gmail. En el back end: `ALERT_WEBHOOK_URL` = URL de producción del webhook y `ALERT_WEBHOOK_SECRET` = el mismo secreto |
| `13-enviar-codigo-email.json` | Webhook `POST /send-code` con `{ "email": "…", "code": "123456" }` → manda el código por email | Credencial **Header Auth** (`X-Ashfield-Secret`) en el webhook; credencial Gmail. URL de producción → `.env` como `N8N_WEBHOOK_URL` |
| `01-whatsapp-smoke.json` | Botón → manda un WhatsApp de prueba | Credencial Twilio en el nodo; tu celular en *To* |
| `02-alerta-fuego-demo.json` | Cada 3 h (o con «Probar ahora»): lee `/api/live` alrededor de cada campo, busca focos nuevos dentro del radio y manda el aviso | En **Suscripciones**: `API_BASE` (URL del deploy), el celular y el campo; credencial Twilio |
| `03-enviar-codigo.json` | Webhook `POST /send-code` con `{ "phone": "+549…", "code": "123456" }` → manda el código por WhatsApp | Credencial **Header Auth** (`X-Ashfield-Secret`) en el webhook; credencial Twilio. La URL de producción va a `.env` como `N8N_WEBHOOK_URL` |

Notas:

- Las suscripciones están escritas a mano en el nodo **Suscripciones** hasta que el back end tenga `GET /api/alerts/subscriptions` (ver `docs/ideas/alerts-and-identity.md`).
- Los focos ya avisados se recuerdan en los datos estáticos del flujo: eso solo funciona con el flujo **activo** (las ejecuciones manuales no guardan memoria, así que «Probar ahora» puede repetir el aviso).
- `/api/live` usa la ventana de 24 h de FIRMS (VIIRS y MODIS). Si la zona es muy grande, la API devuelve celdas en vez de puntos y el flujo no avisa: mantené radios de hasta ~100 km.
- Número de bomberos por país: el mismo que usa `back/app/routers/parcels.py` (AR 100).
- Antes de exportar y commitear un flujo modificado, revisá que no tenga tokens ni teléfonos reales.
