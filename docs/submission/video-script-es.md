# Guión y storyboard del video (~150 s) — español

Video para el jurado de NASA Space Apps 2026 — **Field Shift primero**.
Duración total: **~150 segundos**. Arco: productor y su pregunta → ejemplo de un toque
(finca de Mendoza) → parcelas con fuego y agua → calendario → las cuatro tarjetas de
rotación (en un punto de zona de granos) → validación con su límite honesto → método
(una grilla, muchas resoluciones) → cierre.
La versión en inglés está en `video-script.md`; el mapeo de números a fuentes, en
`facts-sources.md` (interno, no publicar).

## Checklist de producción

- [ ] Ninguna persona menor de 18 años aparece en pantalla.
- [ ] Todos los números narrados coinciden con la columna "Fuente".
- [ ] El ejemplo de un toque es la finca ficticia de Mendoza (D33) — el link `/app/#demo` la abre directo.
- [ ] Las rotaciones no aplican a la finca demo (viñedos y olivos no rotan): la escena de tarjetas se graba con "Analizar mi campo" en un punto de zona de granos.
- [ ] Subtítulos en español; versión con subtítulos en inglés si el tiempo lo permite.
- [ ] Portada: `web/public/brand/ashfield-cover.png` (paleta ember #b3401e, verde cultivo, beige rastrojo — `web/public/brand/`, `tools/brand/`).

## Guión principal (~150 s)

| Segundos | En pantalla | Narración | Texto en pantalla | Fuente de los números |
|---|---|---|---|---|
| 0–12 | Campo real o imagen satelital de un lote; logo Ashfield | "Un productor mira su lote y se pregunta: ¿qué conviene sembrar? El clima cambia, el agua escasea y el suelo se degrada. Ashfield responde con datos de la NASA, no con intuiciones." | "¿Qué conviene sembrar en tu lote?" | Premisa Field Shift → `docs/PRD.md` encabezado |
| 12–28 | App, bienvenida → botón de ejemplo | "Un toque y abre la finca de un productor de ejemplo en Mendoza — persona ficticia, ubicación y datos reales. Cinco parcelas, cada una con su cultivo, y los ocho riesgos ordenados a su manera." | "Un toque → finca de ejemplo en Mendoza" | Finca Mendoza → `docs/decisions.md` D33; 8 riesgos → `web/src/i18n/es.json` |
| 28–38 | Resultado por parcela | "Cada parcela recibe su porcentaje de fuego y de agua — y el motivo de cada número. Tocás el dato y ves de dónde salió y con qué resolución." | "Fuego y agua por parcela, con el porqué" | Badges + razones → `back/app/routers/parcels.py` |
| 38–52 | Calendario agrícola del lote | "El calendario marca siembra, cosecha y los meses de suelo desnudo — los meses en que el lote queda vulnerable, también al fuego." | "Meses vulnerables, marcados" | Calendario + bare-soil → `back/README.md` (`bare_soil_days_yr`) |
| 52–90 | "Analizar mi campo" → punto en la pampa húmeda → "Comparar rotaciones" → las cuatro tarjetas; abrir las 5 secciones de una | "La finca demo cría viñedos y olivos — no rotan. En un punto de la pampa, zona de granos, el mismo análisis sí compara su rotación actual con tres alternativas. Cada tarjeta responde las cinco preguntas del desafío: por qué, la evidencia con su fuente de la NASA, los beneficios, lo que no sabemos y qué validar con el agrónomo. Infiltración, erosión, agua, plagas, ingreso y quemas evitadas — puntuados según sus prioridades." | "Actual + 3 alternativas · 5 secciones por tarjeta" | Rotaciones e indicadores → `back/app/services/rotations.py`; rotaciones no aplican a la finca demo → `web/src/features/field/FieldLens.tsx`; 5 secciones → `docs/PRD.md` §7.4 |
| 90–110 | Tarjeta de validación + `docs/validation/orin/satelite_vs_estaciones.png` | "¿Se puede confiar? Comparamos el satélite contra 53 estaciones reales en Mendoza y contra 25 pluviómetros del INTA. En la montaña el satélite erra varios grados — lo dice la app — y corrigiendo por altura el error baja casi a la mitad." | "Validado en campo: RMSE 5,0 → 2,8 °C" | Orin → `docs/validation/orin/README.md`; SIGA → `docs/validation/rain-siga/` |
| 110–130 | Slide de método: grilla H3 con capas de distinta resolución; `series_global.png` | "Detrás hay un motor que lleva datos heterogéneos a una grilla común — el requisito F8 del desafío. El ejemplo que mejor lo muestra: 568 millones de focos MODIS y VIIRS en una sola serie comparable, validada con años que la calibración nunca vio." | "Una grilla, muchas resoluciones · R² 0,979" | 568 M / R² → `docs/validation/metrics.json`, `docs/metodo-fuego.md` |
| 130–150 | Cierre: la app en el lote + logo | "Ashfield no reemplaza al agrónomo — le da al productor las preguntas correctas, con evidencia. Datos de la NASA, traducidos a decisiones." | "Ashfield · Field Shift — apoyo a la decisión" | Disclaimer → `docs/PRD.md` §7.4 |

**Total: ~150 s.**

## Versión corta de 60 segundos (redes)

| Segundos | En pantalla | Narración | Texto en pantalla | Fuente de los números |
|---|---|---|---|---|
| 0–10 | Lote desde arriba → logo | "¿Qué conviene sembrar? Un productor lo decide con datos de la NASA." | "¿Qué conviene sembrar en tu lote?" | `docs/PRD.md` |
| 10–25 | Finca Mendoza → badges de parcela → calendario | "Un toque abre su finca de ejemplo: porcentaje de fuego y de agua por parcela, con el motivo, y un calendario que marca los meses vulnerables." | "Fuego y agua por parcela" | `back/app/routers/parcels.py` |
| 25–45 | "Analizar mi campo" en un punto de granos → las 4 tarjetas | "En zona de granos, su rotación contra tres alternativas — cada una con por qué, evidencia NASA, beneficios, vacíos y riesgos a validar con su agrónomo." | "1 + 3 rotaciones, 5 secciones" | `back/app/services/rotations.py` |
| 45–55 | `satelite_vs_estaciones.png` | "Validado contra 53 estaciones reales — y muestra también dónde el satélite falla." | "Satélite vs. campo, honestamente" | `docs/validation/orin/README.md` |
| 55–60 | Portada + cierre | "Datos de la NASA, traducidos a decisiones." | "Ashfield · NASA Space Apps 2026" | `docs/PRD.md` encabezado |

**Total: 60 s.**

## Checklist de grabación

**Ventana 1280 px (toma principal):**

- [ ] Landing `/` — promesa nueva ("Decidí qué sembrar en tu lote…") y CTAs visibles.
- [ ] Bienvenida → ejemplo de un toque → finca de Mendoza (recorrido guiado cerrado antes de grabar).
- [ ] Badges de fuego/agua por parcela con "de dónde sale el dato".
- [ ] Calendario agrícola con meses de suelo desnudo.
- [ ] "Analizar mi campo" → punto en zona de granos → las 4 tarjetas de rotación + las 5 secciones de una abierta.
- [ ] Tarjeta de validación (Orin) y mención SIGA.
- [ ] Slide de método (grilla + `series_global.png`).

**Ventana 390 px (segunda toma — prueba el flujo móvil):**

- [ ] Landing a 390 px sin scroll horizontal.
- [ ] Demo → parcelas → badges → calendario en el panel móvil.
- [ ] Tarjetas de rotación en móvil.

**Ambos:**

- [ ] Backend en `localhost:8000`, datos en el R2 público — solo números reales.
- [ ] Sin datos personales en pantalla; el productor es ficticio.
- [ ] Ningún número re-editado en post.
