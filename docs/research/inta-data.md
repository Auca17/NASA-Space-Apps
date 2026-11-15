# INTA open data scan — what can validate Field Shift satellite estimates (F10)

Research note, 2026-12. Goal: find INTA-published open sources that could
act as ground truth for the app’s satellite/model estimates of rain,
soil moisture and NDVI. Small access probes only; no bulk download.

## 1. SIGA — Sistema de Información y Gestión Agrometeorológica

- **Portal**: https://siga.inta.gob.ar (checked 200 OK).
- **What it is**: centralized historical + current agromet database of
  INTA station networks, created 2012; free download for anyone
  (INTA Informa).
- **Variables** (per-station daily XLS): precipitation, air temp
  max/min/mean, RH, wind, radiation/sunshine, soil temperature at
  several depths, and on equipped stations **soil moisture**, chill
  hours / cold units (≈22 numeric columns + metadata sheet).
- **Coverage found** (stations JSON, `param_type=estacion` → 182
  stations; `param_type=estacionautomatica` → 394 incl. non-INTA
  networks):
  - Mendoza: 11 stations — Junín (A872938), La Consulta (A872939),
    Pareditas (A872940), Tupungato (A872941), Santa Rosa–Junín
    (A872937), Rama Caída (A872933), Malargüe (A872935), La Guevarina
    (A872934) + conventional EMC Mendoza/Rama Caída/La Consulta.
    Tupungato & La Consulta sit in/near Valle de Uco — directly
    relevant to the Mendoza demo.
  - Pampas: 39 Buenos Aires + 3 La Pampa + 15 Santa Fe + 10 Córdoba;
    Pergamino EEA is in the network (and hosts an INTA weather radar).
  - Periods: conventional EMC from ~1968; automatic Nimbus mostly
    2014→now, several still reporting (maximoDiario 2026-11).
- **Access method**: no auth.
  - Stations list:
    `http://siga.inta.gob.ar/5WP5HPJSeLmID3Wy.php?param_type=estacion&param_value=`
    (URL discovered via `js/urlserver.js`; also `estacionautomatica`,
    `datohorario`, `datodiario` types). Verified: JSON, 182 rows.
  - Per-station daily series:
    `http://siga.inta.gob.ar/document/series/{idInterno}.xls`
    — verified 200, `application/vnd.ms-excel`, ~0.9 MB full series
    (Junín A872938).
  - Official R package `{siga}` (GPL-3, github.com/AgRoMeteorologiaINTA/siga)
    wraps both endpoints — confirms the URLs are the supported path.
- **Format**: JSON (stations), XLS (series). Automatic download: yes.
- **License**: public service / free download; no explicit open license
  text found on the portal (R package is GPL-3 for the wrapper only).
- **Measurement or model**: measurement (stations).

## 2. Soil-moisture probes (not model maps)

- SIGA stations carry **soil temperature and humidity** variables;
  coverage is per-station, not gridded — has to be filtered per
  station metadata/variables.
- INTA/UTN campaign added soil-moisture probes to ~9 stations in the
  Pampas region (INTA Castelar/25 de Mayo, in collaboration with the
  Ministry’s Oficina de Riego Agropecuario) — the clearest probe
  ground truth for SMAP/GWETROOT comparison.
- INTA low-cost capacitive probe (B01) + “Proyecto SENSOR” exist as
  technology/dataloggers, but their data are not openly published.
- SEPA (INTA weekly service) publishes **soil-moisture maps** — those
  are modeled/derived products, not probe measurements; useful for
  spatial sanity checks only.

## 3. NDVI / vegetation ground truth

- No standing open NDVI ground-truth network. What exists:
  - **Mapa Nacional de Cultivos** (INTA CIRN / Instituto de Clima y
    Agua, de Abelleyra): supervised Landsat/Sentinel-2 classification
    with **field survey samples** split train/validation — per-campaign
    crop maps, useful as lot-level truth for vigor/bare-soil logic.
    Report: repositorio.inta.gob.ar handle 20.500.12123/16522.
  - UNCuyo/INTA Mendoza vineyard study: terrestrial proximal NDVI vs
    Landsat-8/Spot-5 as “verdad de campo” (low correlation found —
    honest warning that ground NDVI ≠ satellite NDVI).
  - INTA Salta: Sentinel-2 zones validated with UAV-LiDAR in sugarcane.
  - MODIS 250 m cropland product (RPIC 2023) with field reference
    records, 52–72 % overall accuracy — a calibration reference for
    bare-soil-days thresholds.
- These are campaign/project datasets, not a queryable API.

## 4. Soil maps — GeoINTA / INTA Digital GEO / SisINTA

- **GeoINTA** (geointa.inta.gob.ar, checked 200): GeoNode + GeoServer;
  thematic layers (soils, pH, OM, climate, land use) per project/node;
  WMS/WFS + raster/vector downloads, free.
- **Cartas de suelos Buenos Aires 1:50.000 v3.0** (INTA Digital
  repository): vector soil series + updated IP index, open access,
  **CC BY-NC-SA 4.0** — note the non-commercial clause.
- **SisINTA** (~7.000 georeferenced soil profiles): field + lab data
  (texture, OM, pH…) with public/authorized access levels, exportable
  to tables; viewer at visor.inta.gob.ar (checked 200).
- Access: WMS/WFS and file downloads — automatable; profile DB may need
  registration for full export.
- **Measurement or model**: measurements (profiles/maps from surveys).

## 5. INTA weather radars (bonus for rain)

- Pergamino, Paraná, Anguil (240 km radius each, with SMN) — online
  imagery for operational use; not a clean historical series, but
  radar QPE could cross-check IMERG heavy-rain days in the Pampas.

## Conclusions for F10 (closing the validation loop)

| variable | best INTA source | status |
|---|---|---|
| Rain | **SIGA daily precipitation** — 39 BA + 3 LP stations (Pampas) and 11 in Mendoza; free XLS per station, machine-readable | **viable now**: POWER/IMERG vs pluviometer RMSE per cell-month |
| Soil moisture | SIGA stations **with probes** (~9 in the Pampas after the UTN/riego campaign; Mendoza stations to check per-station variables) | viable but sparse: point vs 9–33 km grid cell; use as bias indicator, not spatial truth |
| NDVI | Mapa Nacional de Cultivos field samples + campaign maps; vineyard proximal-NDVI study shows ground↔satellite is not a 1:1 transfer | partial: validates crop/vigor classification, not continuous NDVI; our S2-vs-MODIS cross-check (task 24) remains the honest in-app comparison |

**Suggested F10 pilot**: download SIGA XLS for Junín (A872938) and a
a pampa-area station, compute monthly rain vs IMERG/POWER cell —
small, scriptable, no auth. Soil moisture second (probe coverage
uncertain). NDVI stays satellite-vs-satellite + crop-map checks.
