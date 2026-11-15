# Devin task 26 — "Hay fuego ahora": direct emergency call from the app

You run in your own worktree and branch: after your smoke-test report, `git fetch; git checkout -B feat/emergency origin/main`. Commit on your branch is allowed (conventional commits, no AI trailers); push the branch, never main. Never print secrets. Surface mode: Operate, high stakes: calm, clear, word-first, no color alone, 44 px targets, keyboard operable, contrast 4.5, es and en with the i18n completeness test.

## Goal

When the app shows fire near the user, or the risk is high, the user can call the emergency service with one tap and read to the operator what the app knows. The app never calls by itself, never sends the location anywhere, and never claims a fire is confirmed.

## Behavior

1. **Where it appears**
   - Live mode: when at least one detection (points mode) is within 10 km of the user location (if shared) or of the reticle, show a card "Hay un foco detectado cerca" with the distance, direction (8-point compass) and the time since detection of the nearest one, and the call block below.
   - Area panel: when the 7-day risk category is `alto` or `muy_alto`, or the semaphore category is `extremo`, show the call block under the risk with the sentence "Si ves fuego o humo, llamá ya; no esperes a que la app lo confirme".
   - Always reachable: an "Emergencias" entry in the app menu or footer opens the same block, with no condition.
2. **The call block**
   - Large buttons made of real links: `<a href="tel:100">Llamar a Bomberos (100)</a>` and `<a href="tel:911">Llamar a Emergencias (911)</a>` for Argentina; the numbers are also written as text next to the buttons because `tel:` does nothing on most desktop browsers.
   - A button "Copiar lo que tengo que decir" that copies to the clipboard (with a visible confirmation and a text fallback if the clipboard is blocked) a short message in Spanish, built from a template: "Quiero avisar de un posible foco de fuego. Mi ubicación: <lat, lon> (<link a un mapa>). La app detectó un foco satelital a <X km> al <dirección>, hace <N horas>. Viento: <valor si está> ". Only values the app really has; omit a field when missing; never invent. The location is the user's own (if shared) or the reticle center, and the message says which.
   - A fixed notice: "Una detección satelital no es un incendio confirmado y llega con horas de demora. Si ves fuego o humo, llamá igual." (reuse the existing live notice wording).
3. **Numbers by country**: use the country returned by the diagnosis (`country`) or, if absent, an offline country lookup from the point (reuse the Natural Earth data already in `back/data/` through the back, or add `country` to `/api/live` and `/api/risk` responses if cheaper). Argentina: Bomberos 100 and Emergencias 911 (source: docs/PRD.md). For other countries include **only numbers you can verify from an official government or emergency-service page**; keep a typed table in `web/src/content/emergency.ts` with the number, what it is for, and the source URL for every row, and cover at least: Argentina, Chile, Uruguay, Paraguay, Brasil, Bolivia, México, Estados Unidos, Canadá, España, Portugal, Australia, and the EU-wide 112. Where a country is not in the table, show "Llamá al número de emergencias de tu país" with no number, never a guess. Test that every row has a source URL and a number matching `^[0-9]{2,4}$`.
4. **Privacy and safety copy**: "Tu ubicación no se envía a ningún servidor; solo se muestra y se copia si vos lo pedís." The block must work with no location shared (then it says the coordinates are those of the map center, and offers "Usar mi ubicación"). No automatic dialing, no countdowns, no alarms, no sound, no push.
5. **Landing and docs**: add one honest sentence to `web/src/content/datasets.ts`/methods panel only if a limitations list exists (the feature is decision support, not an alert service); add `D33` to nothing (the orchestrator records decisions). Update `web/README.md`.

## Tests and checks

Domain tests for distance and direction, the message template (missing fields omitted, nothing invented), the country table rules, the card appearing only under the stated conditions (live detections within 10 km, risk alto or muy_alto, semaphore extremo, always from the menu), keyboard operation and the clipboard fallback. Typecheck, lint, tests and build must pass. Run `C:/Users/Rufda/.claude/skills/impeccable/scripts/impeccable detect --json web/src web/index.html`. Screenshots at 390 and 1280 px of: the live card with a nearby detection (use a synthetic live response only in a test harness and never commit it as data), the area panel with high risk, and the menu entry.

## Report

What was built, the final country table with sources, the message template output for two examples, screenshots, test counts, and any limitation (for example `tel:` on desktop).
