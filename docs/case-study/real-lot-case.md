# Caso real: incendio de cosechadora en San Genaro, Santa Fe

**Fecha:** 4 de mayo de 2026 · **Lugar:** San Genaro, Santa Fe, Argentina
**Tipo:** reporte periodístico (`news_report`) — no es un testimonio de los
trabajadores.

## Qué pasó

Una cosechadora se prendió fuego en plena zona rural y el incendio se
propagó al lote de soja. Bomberos voluntarios sofocaron el fuego y
enfriaron el terreno alrededor.

## Lo que no se sabe

No se sabe qué equipamiento ni qué cortafuegos había en el lote antes del
incidente (`unknown` en `cases.json`).

## Para tener en cuenta

Las tres cosas que la app muestra junto a este caso:

1. Ubicación exacta y acceso al lote (para que los bomberos lleguen sin
   demora).
2. Viento al momento de la alerta (las condiciones de parada regional de
   `stop_thresholds`).
3. Los chequeos de la cosechadora (pérdidas de gasoil y aceite,
   matachispas del escape).

## Fuente

- [Reporte del incendio (MDR)](https://mdr.ar/contenido/51738/san-genaro-bomberos-sofocaron-el-incendio-de-una-cosechadora-en-plena-zona-rural)

El mismo caso vive en `back/knowledge/cases.json` (`id:
san-genaro-2026-05-04`) y se muestra en el front como tarjeta "Un caso
real" dentro del bloque de medidas de prevención cuando aparece
`clean_harvester` o `harvest_timing`.
