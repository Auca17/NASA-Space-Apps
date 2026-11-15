# Flujos de n8n de Ashfield

Flujos para importar en n8n (Workflows → menú ⋯ → Import from file). No traen credenciales ni teléfonos reales: se completan en n8n.

Canal para la demo: **sandbox de WhatsApp de Twilio** (Meta bloqueó la cuenta de Facebook que iba a crear la app de WhatsApp Cloud API). Para producción sigue haciendo falta una cuenta de Meta Business (`docs/ops/n8n-whatsapp-setup.md`); al pasar a ella se cambia solo el nodo de envío.

| Archivo | Qué hace | Qué completar después de importar |
|---|---|---|
| `01-whatsapp-smoke.json` | Botón → manda un WhatsApp de prueba | Credencial Twilio en el nodo; tu celular en *To* |
| `02-alerta-fuego-demo.json` | Cada 3 h (o con «Probar ahora»): lee `/api/live` alrededor de cada campo, busca focos nuevos dentro del radio y manda el aviso | En **Suscripciones**: `API_BASE` (URL del deploy), el celular y el campo; credencial Twilio |
| `03-enviar-codigo.json` | Webhook `POST /send-code` con `{ "phone": "+549…", "code": "123456" }` → manda el código por WhatsApp | Credencial **Header Auth** (`X-Ashfield-Secret`) en el webhook; credencial Twilio. La URL de producción va a `.env` como `N8N_WEBHOOK_URL` |

Notas:

- Cada celular tiene que mandar una vez `join <palabras>` al número del sandbox (+1 415 523 8886). El sandbox entrega mensajes libres solo dentro de las 24 h desde el último mensaje de ese celular; para la demo, mandá cualquier mensaje al sandbox antes de probar.
- Las suscripciones están escritas a mano en el nodo **Suscripciones** hasta que el back end tenga `GET /api/alerts/subscriptions` (ver `docs/ideas/alerts-and-identity.md`).
- Los focos ya avisados se recuerdan en los datos estáticos del flujo: eso solo funciona con el flujo **activo** (las ejecuciones manuales no guardan memoria, así que «Probar ahora» puede repetir el aviso).
- `/api/live` usa la ventana de 24 h de FIRMS (VIIRS y MODIS). Si la zona es muy grande, la API devuelve celdas en vez de puntos y el flujo no avisa: mantené radios de hasta ~100 km.
- Número de bomberos por país: el mismo que usa `back/app/routers/parcels.py` (AR 100).
- Antes de exportar y commitear un flujo modificado, revisá que no tenga tokens ni teléfonos reales.
