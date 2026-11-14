# Revisión agronómica del conocimiento de la app

Este documento es para quienes validan el contenido agronómico de la herramienta: agrónomos, asesores y productores. Los archivos que se revisan son `back/knowledge/crops.json` (15 cultivos), `back/knowledge/rotations.json` (12 rotaciones) y `back/knowledge/measures.json` (6 medidas de prevención de incendios). Lo que sigue es lo que más necesitamos que confirmen o corrijan. El detalle técnico original está en `back/knowledge/REVIEW.md`.

## Cómo responder

Para cada ítem alcanza con una de tres respuestas: **Correcto**, **Corregir a: [valor] (fuente)** o **No sé**. Lo que quede sin responder lo marcamos en la app como "pendiente de validación". No hace falta justificar todo: un dato con fuente vale más que diez opiniones.

## 1. Lo que más pesa en el resultado (prioridad alta)

El motor usa estos números en sus cuentas. Un error acá cambia qué rotación queda primera.

| Dato | Valor actual | De dónde sale | Pregunta |
|---|---|---|---|
| Uso de agua por ciclo (mm), soja | 575 | FAO-33, punto medio del rango | ¿Es razonable para secano argentino? |
| Uso de agua, maíz | 650 | FAO-33 | ¿Es razonable? |
| Uso de agua, trigo | 550 | FAO-33 | ¿Es razonable? |
| Uso de agua, girasol | 800 | FAO-33 | Parece alto. ¿Qué valor usan en la práctica? |
| Uso de agua, algodón | 1000 | FAO-33 | Parece alto. ¿Qué valor usan? |
| Uso de agua, sorgo | 550 | FAO-33 | ¿Es razonable? |
| Uso de agua, maní, arveja | 600, 425 | FAO-33 | ¿Es razonable? |
| Uso de agua, cebada, colza | 400, 440 | Alberta Agri-Facts 2011 (Canadá) | Reemplazar por un valor argentino (INTA Anguil o Balcarce). |
| Uso de agua, garbanzo | 268 | Zhang et al. 2000 (Siria) | Reemplazar por un valor argentino (NOA o Córdoba). |
| Uso de agua, avena, centeno, vicia | 194, 194, 175 | Cultivos de cobertura hasta el secado | ¿Es esto lo que queremos comparar? No es un ciclo completo de grano. |
| Uso de agua, alfalfa | 1200 por año | FAO-33 | Es perenne. ¿Cómo prefieren compararla con una rotación anual? |
| Rastrojo (t/ha): soja, maíz, trigo, girasol, sorgo | 3,4; 7,5; 4,5; 3,7; 6,1 | Estimación propia: rendimiento × (1 − índice de cosecha) / índice de cosecha | Reemplazar por los coeficientes de la Red de Brechas de Carbono AAPRESID-INTA 2023-24. |
| Rastrojo: cebada, maní, algodón, colza, garbanzo, arveja | 4,3; 2,0; 3,0; 3,0; 1,5; 2,0 | Estimaciones gruesas | ¿Alguna cifra de referencia? |
| Rastrojo: alfalfa | 0 | Se corta o se pastorea | ¿Es 0, o hay que contar raíz y corona? |
| Mercado en Argentina | Alto: soja, maíz, trigo. Medio: girasol, sorgo, cebada, maní, algodón, alfalfa, garbanzo. Bajo: avena, centeno, vicia, colza, arveja | Cualitativo, MAGyP | ¿Cambiarían alguno? El trigo figuraba como "medio" antes. |
| Tolerancia a heladas | Solo "alta" (omite el control de heladas): trigo, cebada, alfalfa, centeno, vicia | FAO ECOCROP | Garbanzo, arveja y colza figuran como "media" y fallan el control en ciclos de invierno. ¿Es correcto? |

## 2. Fechas de siembra y cosecha por zona

Las ventanas son conocimiento agronómico general, no un calendario regional. Bases: MAGyP, Bolsa de Cereales, USDA y la zonificación del maíz de INTA 2024.

- **¿Son correctas las fechas de cada cultivo en cada zona?** Zonas: Pampa húmeda, NEA, NOA, Cuyo y Patagonia.
- **Maíz y sorgo en Pampa húmeda:** la cosecha termina el 15 de junio. El maíz tardío se cosecha hasta julio, pero lo recortamos para que no quede fuera del período libre de heladas. ¿Es aceptable?
- **Presencia por zona:** Cuyo solo tiene maíz y alfalfa. Patagonia solo alfalfa. NEA: soja, maíz, trigo, girasol, sorgo, algodón, alfalfa y vicia. NOA: soja, maíz, trigo, sorgo, algodón, alfalfa y garbanzo. Maní, cebada, avena, centeno, colza y arveja: solo Pampa húmeda. ¿Falta algo o sobra algo?
- **Alfalfa:** el período de cosecha es del primer al último corte, no una fecha única.
- **Grados-día base 10 °C:** quedaron vacíos en los 15 cultivos porque no hallamos una fuente argentina. ¿Qué base y qué valor usan ustedes?
- **Profundidad de raíz:** vacía para centeno y vicia. ¿Un valor de referencia?

## 3. Rotaciones

| Rotación | Zonas | Días de suelo desnudo por año (estimado) |
|---|---|---|
| Soja – soja | Pampa húmeda, NEA, NOA | 199 |
| Trigo / soja de segunda – maíz | Pampa húmeda | 114 |
| Maíz – soja con vicia | Pampa húmeda | 97 |
| Sorgo – soja – trigo / soja de segunda | Pampa húmeda | 140 |
| Maíz – soja | Pampa húmeda, NEA, NOA | 196 |
| Trigo / soja de segunda – maíz – soja | Pampa húmeda | 142 |
| Soja – centeno | Pampa húmeda | 35 |
| Girasol – trigo / soja de segunda | Pampa húmeda | 126 |
| Cebada / soja de segunda – maíz | Pampa húmeda | 120 |
| Alfalfa 3 años – maíz – trigo / soja de segunda | Pampa húmeda | 46 |
| Garbanzo – maíz | NOA | 48 |
| Alfalfa 4 años – maíz | Cuyo, bajo riego | 36 |

- **Patagonia no tiene rotación.** Hoy la app muestra soja – soja como reemplazo. ¿Qué rotación corresponde?
- **¿Es soja – soja la rotación típica actual en NEA y NOA?** La app la usa como "la típica de la zona" cuando el productor responde "no sé".
- **Días de suelo desnudo:** se calculan como los días del año sin cultivo vivo. El rastrojo en pie no se descuenta. ¿Es la definición que usarían?
- **Fechas dentro de cada rotación**, en especial soja de segunda después de trigo o cebada, y garbanzo con maíz en NOA como doble cultivo. ¿Son correctas?
- **Trigo y cebada dan el mismo resultado** en la comparación. ¿Tiene sentido mostrar ambas como alternativas distintas, o es mejor presentarlas como una sola con dos variantes?

## 4. Medidas de prevención de incendios (con el productor)

Qué hacer, cuánto cuesta y cuándo se sugiere. Fuente principal: INTA, UIB Balcarce y Bomberos Tandil (28/12/2023), y la Ley 26.562 para la quema de rastrojos.

| Medida | Cuándo la sugerimos | Costo estimado |
|---|---|---|
| Limpiar la cosechadora y revisar sus partes calientes | Cosecha en temporada seca | Bajo (30 minutos por limpieza, dato INTA) |
| Evitar cosechar en horas de calor, sequedad y viento | Clima de fuego alto | Bajo |
| Agua y matafuegos en la máquina y en el lote | Cosecha en temporada seca o clima de fuego alto | Medio |
| Mantener el cortafuego | Clima de fuego alto o riesgo alto | Medio |
| Protocolo de respuesta ante un foco | Riesgo alto o temporada de quemas | Bajo |
| No quemar rastrojo | Suelo desnudo en temporada de quemas o temporada de quemas | Bajo |

Preguntas:

- **Umbrales de suspender la tarea** (viento mayor a 40 km/h, temperatura mayor a 35 °C o humedad menor a 30 %): ¿coinciden con lo que se hace en el campo?
- **Datos del INTA:** motor a más de 600 °C, cerca del 80 % de los focos nacen en el motor, extintores ABC por máquina y tanque de al menos 500 litros con bomba. ¿Los confirman?
- **Personas, maquinaria y costo** de cada medida son estimaciones nuestras, salvo el tiempo de limpieza. ¿Cómo las ajustarían?
- **Cortafuego:** ni el INTA ni nosotros dimos un ancho ni un esfuerzo. ¿Qué ancho es habitual?
- **¿Cada medida se sugiere en el momento correcto?** Por ejemplo, ¿tiene sentido el protocolo de respuesta cuando el riesgo es alto, o solo en temporada de cosecha?
- **¿Falta alguna medida** que ustedes tomarían?

## 5. Un caso real

Si pueden contarnos un caso concreto con lugar y fecha ("en marzo de 2023 se prendió un lote en tal partido"), lo mostramos en el globo histórico. Nos ayuda más que cualquier respuesta general. Contanos qué medidas tenían a mano y qué información les habría servido para decidir.

Respuesta rápida, por favor: estamos contra el reloj y cada confirmación nos ahorra horas.
