# Piloto de pronóstico de heladas de Orin (Perdriel)

## Qué es

Un piloto de pronóstico de **temperatura mínima nocturna** para una sola
estación (Perdriel, Mendoza). Cada noche el sistema emite un pronóstico
crudo y una versión con corrección de sesgo basada en la propia estación;
al cerrar la noche se compara cada uno contra la mínima observada por la
estación.

## Período y muestra

- Del **2026-09-29 al 2026-11-14**: 34 noches, de las cuales **24
  completas** (las otras 10 quedaron incompletas por cortes de datos).
- Una sola estación, temporada de primavera.

## Números (calculados desde `pilot_results.json`, n = 24 noches completas)

| Pronóstico | RMSE | Sesgo |
|---|---|---|
| Crudo | 3,07 °C | +0,40 °C |
| Corregido | 3,64 °C | −2,25 °C |

La corrección de sesgo **empeoró** el pronóstico en esta muestra: pasó de
un sesgo casi nulo a subestimar la mínima por 2,25 °C en promedio.

**Resultados por noche:** las 24 noches completas terminaron en
"correcto sin alerta" (ni alerta innecesaria ni helada omitida).

## Límites

- **No hubo ninguna helada en la muestra**, así que el valor de la alerta
  no se puede juzgar: "correcto sin alerta" es lo esperado aunque el
  pronóstico fuera mediocre.
- Una sola estación y una sola temporada (primavera); no generaliza a
  otros sitios ni al otoño.
- La corrección debería re-evaluarse sobre una temporada con heladas
  reales antes de usarse — este piloto **no** prueba que la calibración
  ayude; en esta muestra la empeoró.
