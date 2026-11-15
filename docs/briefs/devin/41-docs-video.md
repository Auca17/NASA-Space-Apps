# Devin task 41 — Landing requirement table, README and the video script

Branch: `git fetch; git checkout -B docs/submission-update origin/main`. You own `web/src/landing/**`, `README.md`, `README.es.md`, `docs/submission/**`. Do not edit the app. Commit on the branch (conventional commits, no AI trailers), push, never main. Do not stop servers on ports 8000, 5173, 5174.

## 1. Requirement table (landing, both languages)

Update the Field Shift rows to reflect what main does now, keeping the honest statuses rules (a status moves to "done" only if the app really does it, verified in the running app at http://localhost:5174/app/ with the back end on port 8000):

- F2: producer priorities now include a ranked list of eight hazards (fire, drought, El Niño, frost, heat, snow, hail, flood), needs (water access, emergency distance, worries), parcels with their crops, and costs, prices and margins per parcel.
- F4: parcels result: fire and water percent per parcel with the reason for each number, alerts, zones on the map.
- F7: the AI summary now runs (Gemini) with validation and a template fallback; keep the limit that it needs a server key.
- F1 and F6: another terminal is adding evaporation and infiltration (task 39). Do not change their status yet; leave a TODO comment in `content.ts` naming task 39.
- Add El Niño tendency, snow days and the hail "no data" honesty where they fit.

## 2. README (English and Spanish)

What Ashfield does today (fire lens, field lens with parcels and priorities, alerts idea marked as planned), how to run it locally, the data sources table (add IMERG, GWETROOT, ONI from NOAA CPC, OpenStreetMap, Gemini), and the honest limits. Keep it short and scannable.

## 3. Video script for Alex (`docs/submission/video-script.md`)

A 2 to 3 minute script, in Spanish with an English version, built around the Mendoza demo (a fictional producer, task 40): problem in one sentence, open the app, the demo farm, the per-parcel fire and water badges, the alert and the emergency call, the priorities tab, the fire lens (25 years harmonized, live detections), the validation with its honest limit, the close. For each scene: duration, what is on screen, the exact narration, and the click path. End with a checklist of what to record and at which window size (1280 px and a phone at 390 px).

## Report

What changed, screenshots of the landing table at 390 and 1280 px, and the script.
