# Ashfield: problema, solución, valor agregado y de dónde sale cada dato

Documento base para rehacer la landing. Todo está verificado contra el README, `docs/decisions.md`, `docs/validation/` y el código de `main` (87203c2). Si algo cambia en el producto, este archivo se corrige primero.

## 1. El problema

**Campo (Field Shift).** El productor decide qué sembrar con clima cada vez menos predecible, agua escasa y suelos degradados. Elegir una rotación que cuide suelo y agua es difícil: lo que mejora el suelo en un lugar gasta demasiada agua o cae fuera de temporada en otro. En Argentina se suma la quema de rastrojo y pastizales, que daña el suelo y es una fuente importante de anomalías térmicas.

**Fuego (Hot Spots).** El registro satelital de focos de calor está partido entre sensores que no se pueden comparar: MODIS (píxel de 1 km, desde 2000, termina su misión en 2026) y VIIRS (375 m, desde 2012), que ve fuegos más chicos y fragmenta un incendio en más detecciones. Sin armonizar, la serie da un salto cuando entra VIIRS y no se sabe si un año fue peor o si solo cambió el sensor.

**Lo que une los dos:** hay mucho dato de la NASA, a resoluciones distintas, que nadie traduce en decisiones para quien está parado en el campo.

## 2. Qué solucionamos

| Problema | Qué hace Ashfield |
|---|---|
| El productor no sabe qué sembrar con clima cambiante | Compara la rotación actual con hasta 3 alternativas, cada una con: por qué encaja, evidencia de datos satelitales, beneficios esperados, vacíos de información y riesgos |
| Los datos satelitales están en formatos y escalas que no se entienden | Un diagnóstico por parcela en lenguaje llano: % de fuego y de agua con la razón de cada número, alertas, y todo lo demás a un toque (fuente, resolución, confianza) |
| No se sabe cuándo el suelo o la planta están vulnerables | Calendario con la rotación superpuesta y los meses donde el cultivo coincide con helada o déficit de agua |
| No se sabe cuánto confiar en el satélite | Validación contra mediciones reales (53 estaciones de Orin para temperatura, 25 de INTA para lluvia) con el error reportado, y una tarjeta «qué tan bien ve el satélite tu lote» en cada diagnóstico |
| El fuego y el campo se miran por separado | El riesgo de fuego a 7 días, la temporada de quemas y el indicador «quemas evitadas» entran en la comparación de rotaciones |
| Las series de fuego saltan según el sensor | Armonización de MODIS y VIIRS a una unidad común (detecciones equivalentes a VIIRS NOAA-20), sobre una grilla H3: 25 años comparables |

## 3. Valor agregado

1. **Traducción, no un visor de mapas.** El dato crudo se convierte en una decisión (qué sembrar, qué vigilar), con la razón y la fuente a un toque.
2. **Motor determinístico y explicable.** 15 cultivos y 12 plantillas de rotación, cada dato con fuente. La IA (Gemini) solo redacta en lenguaje simple los números que ya calculó el motor y nunca decide ni cambia el ranking.
3. **Honestidad de datos como característica.** Cada tarjeta muestra fuente, resolución y confianza. Se dice qué no está resuelto: SMAP rechazado, granizo «sin dato satelital», cobertura precalculada solo en Argentina, valores agronómicos pendientes de revisión local.
4. **Validación contra campo.** Comparar el satélite contra estaciones reales casi no se ve en este tipo de herramientas, y es lo que el brief pide.
5. **Una sola grilla (H3) para datos de resolución distinta**, con la serie de fuego como ejemplo trabajado (requisito F8).
6. **El productor decide.** Ordena sus 8 amenazas, carga costos y precios, elige qué ver; el resto queda en «Más información». Sus datos quedan en su navegador: sin cuentas ni almacenamiento en servidor.

## 4. De dónde sale cada dato

### 4.1 Datos de la NASA

| Dato | Para qué se usa | Resolución | Período | Estado en la app |
|---|---|---|---|---|
| **FIRMS: MODIS C6.1, VIIRS S-NPP y VIIRS NOAA-20** | Focos de calor, serie de fuego armonizada, riesgo a 7 días, focos en vivo | 1 km (MODIS), 375 m (VIIRS) | 2000-11 → hoy (tiempo casi real) | En uso |
| **NASA POWER (diario)** | Temperatura, lluvia, heladas, días de calor, nieve, evaporación, clima de fuego | 0,5° × 0,625° (unos 55 × 60 km) | 2001 → ayer | En uso, en vivo para cualquier punto |
| **POWER `GWETROOT`** | Humedad del suelo en la raíz (indicador de agua por parcela) | 0,5° × 0,625° | igual que POWER | En uso |
| **GPM IMERG (mensual V07)** | Lluvia mensual en la grilla de Argentina | 0,1°, mensual | 2015 → 2024 | En uso, precalculado en Argentina |
| **MODIS NDVI (MOD13C2)** | Días de suelo desnudo por año | 0,05°, mensual | varios años | En uso, precalculado en Argentina |
| **MODIS MCD12Q1** | Cobertura del suelo dominante | 500 m | última disponible | En uso, precalculado |
| **SRTM** (vía mosaicos de AWS) | Pendiente y corrección de temperatura por altura | unos 30 m | — | En uso |
| **GRACE-FO** | Tendencia regional de agua a largo plazo | regional | 2018 → hoy | En uso, precalculado en Argentina |
| **ECOSTRESS** | Temperatura de superficie | 70 m | 2024–2025 | Solo en los lotes de Orin, fuera del diagnóstico general |
| **SMAP L3** | Anomalía de humedad del suelo | 9 km | — | Calculado y **rechazado** por no pasar los controles de calidad; se usa `GWETROOT` |
| **GIBS** | Imágenes de fondo (Blue Marble, VIIRS color real en vivo) | — | diaria | En uso, solo como fondo |

### 4.2 Otras fuentes (no NASA)

| Dato | Origen | Para qué se usa |
|---|---|---|
| **Índice ONI (El Niño / La Niña)** | NOAA CPC | Fase actual y tendencia histórica de lluvia por parcela (no es pronóstico) |
| **ESA WorldCover** | ESA | Cobertura del suelo (10 m) |
| **Sentinel-2** | ESA | Qué hay hoy en el campo (cultivo actual) |
| **SoilGrids** | ISRIC | Textura y carbono orgánico del suelo (0–30 cm, 250 m) |
| **Mapa Nacional de Cultivos** | INTA | Cultivo detectado por parcela en Argentina |
| **Estimaciones Agrícolas** | MAGyP | Rotación típica por zona, cultivos análogos y rindes por departamento |
| **Cartografía** | IGN y Natural Earth | Provincias, departamentos y país de cada punto |
| **OpenStreetMap** (Nominatim y Overpass) | OSM | Búsqueda de lugares, bomberos, hospitales y agua cercanos |
| **Gemini Flash** | Google | Resumen opcional en lenguaje simple; necesita clave en el servidor y nunca recibe coordenadas |

### 4.3 Datos de campo para validar al satélite

| Dato | Origen | Qué valida | Resultado |
|---|---|---|---|
| **Orin** | Proyecto Orin: 53 estaciones meteorológicas y lotes en Mendoza, recolectados antes de la hackatón; se usan los datos, nunca su código (decisión D17) | Temperatura de NASA POWER, antes y después de la corrección por altura | Máxima: error 5,05 °C, sesgo −2,82 °C, r 0,63. Mínima: 3,89 °C, −0,67 °C, r 0,46 |
| **INTA SIGA** | Red agrometeorológica del INTA: 25 estaciones útiles, 1.346 pares estación-mes, 2015–2024 | Lluvia de IMERG y POWER | IMERG: sesgo +22,1 mm/mes, error 51,2, r 0,59. POWER: +22,4, 49,4, r 0,62. Los dos sobrestiman, sobre todo en Mendoza (píxel promedia montaña, estación en valle seco) |
| **Orin, lotes demo** | Imágenes ECOSTRESS y NDVI de lotes de Orin | Temperatura de superficie y NDVI MODIS contra Sentinel-2 | NDVI: solo 3 casos, es satélite contra satélite, no se presenta como validación de campo |

Del resto del pipeline: el ajuste entre sensores de fuego tiene R² 0,979 en la serie mensual global (hold-out 2023–2024) y el modelo de riesgo para Argentina da ROC-AUC 0,920 contra 0,843 de la climatología.

## 5. Lo que hay que decir con honesto en la landing

- Las capas precalculadas (lluvia, suelo, NDVI, suelo desnudo, agua a largo plazo) cubren **solo Argentina**; fuera de ahí el diagnóstico usa datos de punto.
- **No tenemos mediciones de campo de NDVI ni de humedad del suelo.** La validación de campo es de temperatura (Orin) y lluvia (INTA).
- Hay 11 estaciones SIGA en Mendoza, y la correlación regional de la lluvia ahí es 0,42, peor que la global.
- La humedad usa POWER a 55 km: un lote chico comparte valor con su vecino.
- El granizo no tiene dato satelital; el escenario climático es un escalado del histórico, no un pronóstico; El Niño es una tendencia histórica.
- Los valores agronómicos son de literatura y esperan revisión de un agrónomo local; las rotaciones son apoyo a la decisión, no asesoramiento.
- Orin: se aclara el origen y que se recolectó antes de la hackatón.

## 6. Preguntas abiertas antes de rehacer la landing

1. ¿Quién es el lector principal de la landing: el jurado de la NASA o el productor? Hoy se escribió para el jurado.
2. ¿Se muestra el nombre Orin en la landing, o solo «estaciones meteorológicas reales de Mendoza» con el detalle en el README?
3. ¿Se separan visualmente «datos de la NASA» y «datos de campo» como en la sección 4?
