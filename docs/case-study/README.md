# Caso de estudio: Corrientes 2022

Material para el video (D13). Celda de control: `85a9441bfffffff`, Esteros del Iberá (D27). Todos los números son focos armonizados, en equivalente VIIRS NOAA-20.

## Números clave

| Dato | Valor |
|---|---|
| Pico de la celda del Iberá | **febrero de 2022: 416 focos** (enero de 2022: 320) |
| Mediana de febrero 2003–2022 en esa celda | **0 focos**: en un febrero normal esa zona no se quema |
| Provincia de Corrientes, enero + febrero de 2022 | **33.255 focos** |
| Mediana de enero + febrero 2003–2022 en la provincia | 1.846 focos → 2022 fue **18 veces lo normal** |
| Provincia de Corrientes, enero + febrero de 2021 | 883 focos → 2022 fue **38 veces el año anterior** |

## Archivos

| Archivo | Para qué |
|---|---|
| `serie_85a9441bfffffff.png` / `.csv` | Serie mensual 2018–2025 de la celda del Iberá, con la mediana 2003–2022 del mismo mes |
| `mapa_ene-feb_2022_vs_2021.png` | Hexágonos res 5 (~250 km²) de enero–febrero 2021 contra 2022, con los departamentos de Corrientes |
| `validacion_video.png` | Serie mundial MODIS / VIIRS / armonizada, 16:9, letras grandes, con R² y sesgo del hold-out |
| `numeros.json` | Los números de la tabla, generados por el script |

Se regeneran con `python pipeline/case_study_corrientes.py`.

## Frase para el video

> En enero y febrero de 2022, Corrientes registró más de 33.000 focos de calor: 18 veces lo normal para esos meses en veinte años. En el corazón de los Esteros del Iberá, donde en un febrero típico no hay ni un foco, hubo 416.
