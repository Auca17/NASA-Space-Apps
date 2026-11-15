# Devin task 19 — Plain-language explanation with AI, safely, with a template fallback

Last part of the chain started in task 17. Rules as in task 17. The challenge brief asks for AI that helps explain patterns and uncertainty; we already have analog zones and the risk model, and the explanation text is template-based today. Add an AI path that **only explains** numbers the engine already computed, never decides, and always falls back to the templates.

## Design

1. `POST /api/field/explain` keeps its current request and response (templates), and adds `mode` in the response: `"ai"` or `"template"`. AI is used only when the environment variable `ANTHROPIC_API_KEY` exists (read from the environment or the root `.env` loader, never logged, never sent to the browser). Without the key the endpoint behaves exactly as today.
2. Model: `claude-haiku-5-5` through the Messages API with `httpx` (`https://api.anthropic.com/v1/messages`, headers `x-api-key` and `anthropic-version: 2023-06-01`), a timeout of 6 seconds, `max_tokens` 700, temperature 0. One request per call explaining all four strategies, so cost stays tiny. Cache the answer by a hash of the input (in-process, 6 hours).
3. Prompt: a short system prompt in Spanish that fixes the role ("explicás en lenguaje simple, para un productor argentino, lo que ya calculó el motor"), forbids inventing numbers, advice outside the data, and any change of ranking; the user content is the JSON of the strategies (ids, indicator values with units, evidence items with their source, gaps, risks, measures, confidence). Ask for strict JSON: `{"strategies":[{"id":"...","text":"...","cites":["indicator_id", ...]}]}` with one paragraph of at most 70 words per strategy and an obligatory sentence about the biggest information gap.
4. **Validation before showing anything**: parse the JSON; every strategy id must exist; every number that appears in a paragraph (digits with optional decimal) must be found in the input data (allow the common rounding and unit conversions: percentages, mm, days, hours, kg, tons per hectare); each `cites` id must exist in the input; the paragraph must not contain words from a small blocklist of unsupported claims ("garantiza", "seguro que", "siempre", "sin riesgo"). On any failure, timeout, HTTP error or missing key, return the template text with `mode: "template"` and log the reason (never the key or the prompt).
5. Front end: when `mode` is `"ai"` show the paragraph with a small label "Explicación generada con IA a partir de los indicadores de arriba" and a link to "Datos y métodos"; when `template`, show it as today without the label. The ranking, scores and measures never come from the AI.
6. Tests with a stub of the HTTP client: valid answer accepted, a paragraph with an invented number rejected (falls back), unknown id rejected, timeout falls back, missing key falls back, cache hit does not call twice. A front test for the label.
7. `back/README.md`: how to enable it (set `ANTHROPIC_API_KEY` in the Vercel project variables), the approximate cost per call at the model's published prices, and the exact validation rules.

Do not call the real API in tests. If a key is present in the environment while you work, you may run one real call against the Pergamino rotations to check the output validates, and report the paragraph; if no key exists, say that the live path is untested.

## Report

What was built, test counts, the validation rules as implemented, and one real sample if a key was available.
