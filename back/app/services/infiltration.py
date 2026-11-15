"""Infiltration estimate (score 0-100, class alta/media/baja).

Transparent additive formula over data already available:

- Soil texture -> USDA hydrologic soil group (NRCS TR-55): the dominant
  driver of how fast water enters the soil.
- Soil organic carbon: more OM -> better structure and porosity.
- Slope: more slope -> more runoff before infiltration.
- Bare-soil days/yr: long bare stretches -> crusting and less cover.

Score = texture_base + soc_bonus + slope_term + cover_term, clamped
to 0-100. Class: >=66 alta, >=33 media, else baja.

Source for the texture ranking: USDA NRCS hydrologic soil groups
(A sand -> D clay), National Engineering Handbook part 630 (TR-55
method). Documented again in back/knowledge/README.md.
"""

TEXTURE_BASE = {
    # USDA hydrologic soil group A -> D (alta -> baja infiltration)
    "Arenoso": 55,          # group A
    "Franco-arenoso": 45,   # group B
    "Franco": 38,           # group B/C
    "Franco-limoso": 35,    # group C
    "Franco-arcilloso": 25,  # group C/D
    "Arcilloso": 12,        # group D
}
_UNKNOWN_TEXTURE = 35


def infiltration_score(texture: str | None, soc_g_kg: float | None,
                       slope_pct: float | None,
                       bare_soil_days: float | None) -> int | None:
    """0-100; None only when no input at all is available."""
    if texture is None and soc_g_kg is None and slope_pct is None \
            and bare_soil_days is None:
        return None
    score = TEXTURE_BASE.get(texture, _UNKNOWN_TEXTURE)
    if soc_g_kg is not None:
        score += (12 if soc_g_kg >= 20 else
                  8 if soc_g_kg >= 10 else
                  4 if soc_g_kg >= 5 else 0)
    if slope_pct is not None:
        score += (15 if slope_pct < 1 else
                  10 if slope_pct < 3 else
                  4 if slope_pct < 8 else 0)
    if bare_soil_days is not None:
        score += (15 if bare_soil_days <= 30 else
                  10 if bare_soil_days <= 100 else
                  4 if bare_soil_days <= 200 else 0)
    return max(0, min(100, score))


def infiltration_class(score: int | None) -> str | None:
    if score is None:
        return None
    return "alta" if score >= 66 else "media" if score >= 33 else "baja"
