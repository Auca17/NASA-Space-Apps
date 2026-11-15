# Idea: fire alerts with n8n and a light user identity (not started)

Status: **idea only**. No agent is working on this. Written to frame the design before anyone builds it. Decisions marked **(open)** need the team.

## 1. What the team lead asked

- An alert system built on **n8n**.
- The first time a user opens the map, ask for a phone number and/or an email, and keep it in a cookie.
- When that user comes back, send a code through n8n (SMS or email) to "validate" the user.

## 2. Why it matters for the product

The field analysis is useful once; an alert is useful every day. If a producer saved their field, the most valuable thing the app can do is tell them, without opening it, when a fire is detected near the field or the risk turns high. The identity step exists only to know where to send that alert.

## 3. Proposed flow

### 3.1 Identity (passwordless, one-time code)

1. The user uses the app freely first. **Decided (2026-11-15, team lead agreed):** ask for the contact **after** the first diagnosis, at the moment it is useful ("¿Querés que te avisemos si hay fuego cerca de este campo?"), not as a gate before the map, and always with a visible "Ahora no". A gate before the map would hurt the jury demo and first-time producers.
2. The user enters a phone (WhatsApp or SMS) and/or an email, and accepts a short consent text (what we store, what for, how to delete it).
3. The back end creates a pending contact, asks n8n to send a 6-digit code, and stores only a hash of the code with a 10-minute expiry and 5 attempts maximum.
4. The user enters the code; the back end marks the contact verified and sets a cookie with an **opaque session id** (random, `HttpOnly`, `Secure`, `SameSite=Lax`, 180 days). **The cookie never contains the phone or the email.**
5. On return, the cookie identifies the user silently. **Decided (2026-11-15, team lead agreed):** a new code is sent only on a new device, when the cookie expired, or before a sensitive change (changing the contact, deleting data). Sending a code on every visit adds cost and friction without security benefit.

### 3.2 Alerts

1. A verified user subscribes a saved field (boundary plus parcels) with preferences: channels, alert kinds (fire nearby, high 7-day risk, drought), distance (for example 5, 10 or 25 km) and quiet hours.
2. An n8n workflow runs on a schedule (every 1 to 3 hours for fire; daily for risk and drought):
   - pulls the list of active subscriptions from our API (`GET /api/alerts/subscriptions`, authenticated with a shared secret),
   - for each field calls our existing endpoints (`/api/live` for detections near the field, `/api/field/parcels` or the risk shards for the 7-day risk),
   - decides whether to alert (new detection within the distance, risk category crosses to alto, dry level for a cultivated parcel), with de-duplication so the same fire does not alert twice,
   - sends the message (WhatsApp or SMS through a provider node, email through an SMTP or email-service node),
   - logs the delivery back to our API.
3. Every message has: what was detected, distance and direction from the field, time of the satellite pass, the reminder "detección satelital, no es un incendio confirmado", the emergency number for the country, a link to the field in the app, and a one-tap way to stop the alerts.

### 3.3 Responsibilities

| Part | Where |
|---|---|
| Contact, code, session, subscriptions, delivery log | Our back end plus a small database |
| Scheduling, decisions loop, sending SMS, WhatsApp, email | n8n |
| Detection and risk data | Our existing API and R2 data |
| Consent text, settings, unsubscribe | Our front end |

## 4. Things to decide or solve before building

1. **Storage (open):** Vercel Hobby has no database. Options: a managed Postgres (Supabase, Neon), a key-value store (Upstash Redis), or n8n's own data store. Contacts are personal data: choose a provider with deletion and backups.
2. **Where n8n runs (open):** n8n Cloud (paid, simplest) or self-hosted (a small VM or container; someone maintains it). The free tiers are limited in executions.
3. **Channels and cost (decided direction, details open): WhatsApp first, email as fallback, SMS last.** Argentine producers live on WhatsApp and rarely read email fast, and a fire alert is useless if it is read hours later. How:
   - Use the **official WhatsApp Business Cloud API** (Meta), which n8n supports with its WhatsApp Business Cloud node. Do not use unofficial WhatsApp Web gateways (WAHA, Evolution API and similar): they break the WhatsApp terms and the number can be banned, which would silence every alert at once.
   - Setup: a Meta developer app with WhatsApp, a phone number not used in the WhatsApp app, and a Meta Business account; business verification is needed to scale beyond the starter limits.
   - Messages the business starts (an alert, a code) must use **pre-approved templates**: one "authentication" template for the code and one "utility" template for the fire alert. Free-text replies are only allowed within 24 h after the user writes to us.
   - Cost: Meta charges per delivered template message (authentication and utility have their own price for Argentina); small for a pilot, but someone must hold the billing account.
   - **Hackathon demo:** the Cloud API test number can message up to 5 verified recipients for free, enough to record a real alert reaching a team member's phone.
   - Email stays as the fallback for users without WhatsApp and for the account recovery path; it is nearly free and needs no template approval.
4. **Privacy and law:** Argentina's personal data law (Ley 25.326) applies: explicit consent, purpose stated, access and deletion on request, data stored safely. Store the phone and email encrypted or at least access-restricted; never in the cookie, never in logs.
5. **The landing promises "no analytics or cookies"** (`PRODUCT.md`). A session cookie for a logged-in feature is acceptable if it is strictly necessary and stated, but the landing text and the privacy note must change. Analytics cookies stay out.
6. **Abuse:** rate limits on code requests per phone, email and IP; a captcha (for example Cloudflare Turnstile) on the request step; codes only to numbers in allowed countries.
7. **Liability:** alerts can be late or wrong (satellite passes are hours apart, clouds hide fires). The consent text and every message must say that this is not an emergency service and that a visible fire must be reported by calling the emergency number.
8. **Scope for the hackathon (open):** the full system is several days of work plus an external service. A credible demo version: WhatsApp through the Cloud API test number (up to 5 verified phones), one n8n workflow with one schedule, a test field, and a recorded alert reaching a phone; email fallback and the rest documented as next steps.

## 5. Suggested next step

Decide items 1, 2, 3 and 8. Then write two briefs: one for the back end (contacts, codes, session, subscriptions, delivery log, endpoints for n8n), one for the front end (consent and contact step, code entry, alert settings, unsubscribe), plus an exported n8n workflow JSON in the repository.

## 6. Setup guide

Accounts and credentials (Meta WhatsApp Cloud API, n8n): `docs/ops/n8n-whatsapp-setup.md`. Proposed defaults pending confirmation: n8n Cloud trial, Supabase free tier, the demo scope in item 8.
