# Product context: Ashfield

*Written by the orchestrator from the repository and the team's decisions (no interview was possible); assumptions are marked. Source of truth for facts: `docs/PRD.md`, `docs/decisions.md`, `README.md`.*

## What it is

Ashfield is a web app built for NASA Space Apps 2026 (registered under the **Field Shift** challenge; it also covers Hot Spots). One harmonization engine turns NASA data of different resolutions into a common H3 grid and shows it through two lenses: **Fire** (25 years of MODIS and VIIRS detections harmonized into one comparable series, a 3D globe, monthly history, live detections, a 7-day risk estimate) and **Field** (the producer outlines a plot and gets a NASA-data diagnosis, an agricultural calendar and a comparison of the current crop rotation with three alternatives, each explained with why, evidence, benefits, information gaps and risks). The two meet in stubble burning: a better rotation is also less fire.

## Surface in scope: the public landing page

Mode: **Persuade** (the visitor decides and acts). Primary audience: the **NASA Space Apps jury**, who evaluate remotely, in a few minutes, against the Field Shift brief, and also look at the video, the demo and the repository. Secondary: Argentine producers and agronomists, journalists, other participants. Primary language English with a full Spanish version.

The visitor must leave knowing: what problem it solves, that it works (open the app in one click), how each requirement of the brief is covered (and what is not), how much to trust the numbers (validation with honest limits), and who built it.

## Brand

Name: **Ashfield**. Assets in `web/public/brand/` (lockups light and dark, mark, favicon, cover) and `tools/brand/`. Palette from the app and the logo: ember `#b3401e`, crop green `#5d8a4e`, stubble `#a8977a`, ink `#1b1b18`, paper `#f7f5f0` (dark paper `#141412`). Personality (assumption): grounded, careful, scientific without coldness, rural Argentina without folklore. Fire and field as one story, not two products.

## Tone and principles

- **Honest over impressive.** Every number and claim is sourced from the repository. What is not done is said plainly (status labels "Hecho / Parcial / No incluido").
- **Evidence first.** The harmonization chart without a jump, the validation figures and the real demo are the proof.
- **Decision support, not advice.** The app supports the producer and never replaces an agronomist; the page repeats this.
- **Plain words.** No jargon without a one-line explanation; Spanish with voseo in the Spanish version, neutral English in the English one.

## Anti-references

Generic SaaS landing (gradient hero, three feature cards with icons, stock photos of tractors, "revolutionizing agriculture" copy), dashboard screenshots with no explanation, fake testimonials, inflated metrics, a map used as pure decoration.

## Constraints

Static and fast (no heavy libraries, hero under 100 KB of media, total transfer under 600 KB excluding images on the first screen), WCAG 2.2 AA, `prefers-reduced-motion`, keyboard operable, works at 360 px, dark mode via `prefers-color-scheme`, Open Graph and Twitter tags, no analytics or cookies. Lives in the same Vercel project as the app: landing at `/`, app at `/app`.
