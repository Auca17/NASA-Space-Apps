# Setup guide: Meta WhatsApp Cloud API credentials and n8n

Companion to `docs/ideas/alerts-and-identity.md`. This covers what a person must do by hand (accounts, credentials); the code is a later brief. Nothing here is built yet.

## Decisions this guide assumes

| Topic | Decision | Status |
|---|---|---|
| When to ask for the contact | After the first diagnosis, with "Ahora no" | Agreed with the team lead (2026-11-15) |
| When to send a code | New device, expired cookie or sensitive change only | Agreed (2026-11-15) |
| Channel | WhatsApp (official Cloud API) first, email fallback, SMS last | Agreed (2026-11-15) |
| Where n8n runs | n8n Cloud on its free trial for the hackathon; self-hosting later if it continues | Proposed, confirm |
| Database | Supabase free tier (Postgres) for contacts, codes, sessions, subscriptions | Proposed, confirm |
| Hackathon scope | WhatsApp test number, up to 5 verified phones, one n8n schedule, one test field, a recorded alert | Proposed, confirm |

## Rules for secrets

- Never paste tokens, IDs that grant access, or passwords in a chat, an issue or a commit.
- Store them in the project `.env` (git-ignored) and, later, in Vercel and n8n credentials.
- Variable names used by the future code:
  - `WHATSAPP_TOKEN`: permanent system-user access token
  - `WHATSAPP_PHONE_NUMBER_ID`: the sending number's ID
  - `WHATSAPP_WABA_ID`: WhatsApp Business Account ID
  - `N8N_WEBHOOK_URL`: the n8n production webhook URL for "send code"
  - `N8N_SHARED_SECRET`: a long random string both sides know

## Part 1: Meta (WhatsApp Business Cloud API)

1. **Facebook account.** Use a personal Facebook account of a team member who will own the setup (Meta requires one). Turn on two-factor authentication.
2. **Meta for Developers.** Go to https://developers.facebook.com, sign in, accept the developer terms and verify your phone if asked.
3. **Create the app.** My Apps, then Create App. Choose the use case for connecting with customers through WhatsApp (the wizard names change; pick the WhatsApp option, type Business). Name it "Ashfield Alerts". When asked for a business portfolio, create one named "Ashfield" (this is the Meta Business account).
4. **Add WhatsApp.** In the app dashboard, add the WhatsApp product. Meta creates a **test WhatsApp Business Account** and a **test phone number** for you.
5. **API Setup page** (WhatsApp, API Setup). Copy into `.env`:
   - the **Phone number ID** of the test number → `WHATSAPP_PHONE_NUMBER_ID`
   - the **WhatsApp Business Account ID** → `WHATSAPP_WABA_ID`
   - the **temporary access token** is valid for about 24 hours: use it only for the first test.
6. **Add recipients.** In "To", add up to 5 phone numbers of the team (format +54 9 ...). Each receives a code by WhatsApp to confirm. Only these numbers can receive messages from the test number.
7. **First test.** On the same page, send the preapproved `hello_world` template to your phone. If it arrives, the account works.
8. **Permanent token.** In Meta Business Settings (https://business.facebook.com/settings), Users, System users:
   - Create a system user "ashfield-n8n" with the Admin role.
   - Add assets: the app (full control) and the WhatsApp account (full control).
   - Generate a new token for the app, with the permissions `whatsapp_business_messaging` and `whatsapp_business_management`, and expiration set to never.
   - Copy it once into `.env` as `WHATSAPP_TOKEN`. Meta does not show it again.
9. **Templates** (WhatsApp Manager, Message templates; drafts for the future code, approval usually takes minutes to hours):
   - `ashfield_codigo`, category **Authentication**, Spanish (Argentina): Meta generates the text "{{1}} es tu código de verificación." with a copy-code button; set expiry 10 minutes.
   - `ashfield_alerta_fuego`, category **Utility**, Spanish (Argentina), body for example: "Ashfield: se detectó un posible foco a {{1}} km de tu campo {{2}} ({{3}}). Es una detección satelital, no un incendio confirmado. Si ves fuego o humo, llamá al {{4}}. Ver en el mapa: {{5}}". Add a quick-reply button "Dejar de recibir avisos".
10. **Later, for real users (not needed for the demo):** add a real phone number to the WhatsApp account, complete business verification of the portfolio, and add a payment method in WhatsApp Manager (template messages are charged per message).

## Part 2: n8n

1. **Account.** Sign up at https://n8n.io (Cloud). The trial is enough for the hackathon. Write down the instance URL (`https://<name>.app.n8n.cloud`).
2. **Credential "WhatsApp API".** In n8n, Credentials, Create, search "WhatsApp":
   - Access Token: the permanent `WHATSAPP_TOKEN`
   - Business Account ID: `WHATSAPP_WABA_ID`
   - Save. n8n tests it.
3. **Credential for our API.** Credentials, Create, "Header Auth": name `X-Ashfield-Secret`, value `N8N_SHARED_SECRET`. Generate the secret with `python -c "import secrets; print(secrets.token_urlsafe(32))"` and store the same value in `.env`.
4. **Smoke workflow** (proves the chain before any code):
   - New workflow "WhatsApp smoke".
   - Add a Manual Trigger.
   - Add the **WhatsApp Business Cloud** node: operation Send Template (or Send Message for `hello_world`), Phone Number ID = `WHATSAPP_PHONE_NUMBER_ID`, recipient = your verified phone, template `hello_world`, language `en_US`.
   - Execute. The message must arrive on your phone.
5. **Code workflow** (for the future back end): a **Webhook** node (POST, path `send-code`, authentication Header Auth with the credential above) → WhatsApp node sending `ashfield_codigo` with `{{ $json.phone }}` and `{{ $json.code }}`. Copy the production webhook URL into `.env` as `N8N_WEBHOOK_URL`. Activate the workflow.
6. **Alert workflow:** built after the back end exposes `GET /api/alerts/subscriptions` (see the idea document). It is a Schedule Trigger, an HTTP Request to our API with Header Auth, a loop over subscriptions, a call to `/api/live`, an IF node for distance and novelty, the WhatsApp node with `ashfield_alerta_fuego`, and an HTTP Request that logs delivery.
7. **Export** each workflow (menu, Download) and commit the JSON under `ops/n8n/` **after** checking that it contains no tokens. n8n stores credentials separately, so exports normally hold only credential names.

## Part 3: what to tell the orchestrator when done

Only statuses, never values:

- "hello_world arrived"
- "permanent token in .env"
- "templates submitted / approved"
- "n8n credentials created"
- "smoke workflow sent a message"
- the n8n instance URL (not secret)

Then the back-end and front-end briefs can be written.
