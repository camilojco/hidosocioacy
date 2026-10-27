# Censo Hidrosocial Acaray–Yguazú

Prototipo de visor para consultar, ubicar y actualizar las fichas del censo hidrosociológico georreferenciado del entorno de los embalses Acaray e Yguazú, y cruzarlas con escenarios de agua y datos hidrometeorológicos.

**Versión de prueba – Camilo Caballero Ocariz.** Programa de Rehabilitación y Modernización del Complejo Hidroeléctrico Acaray–Yguazú (ANDE).

## Cómo abrirlo

Descargar `app/index.html` y abrirlo en Chrome o Edge **con conexión a internet**. Las bibliotecas del mapa y de Excel se cargan desde internet. No hace falta instalar nada.

Los cambios que se hacen en el visor (fichas editadas, entregas cargadas, escenarios, datos de estaciones) se guardan solo en el navegador de quien los hace. Para compartir el estado actual hay que usar **Exportar**.

## Qué hace

- **Fichas del censo:** carga de la entrega de la encuestadora (Excel, CSV o GeoJSON), con reconocimiento de columnas, conversión de UTM y detección de coordenadas invertidas o fuera del área. Incluye consulta, edición, alta de casos marcando el punto en el mapa, reubicación e historial de cambios.
- **Datos del equipo:** 73 sitios de interés visitados (KMZ) y 77 encuestas de depleción de julio y agosto de 2025 (acceso al agua, agricultura y ganadería, pesca y otras observaciones), sin nombres ni teléfonos de las personas entrevistadas.
- **Escenarios de agua:**
  - crecidas por caudal (Q700, Q1400, Q2300 y Q2900, de los KML del equipo);
  - niveles de los embalses Yguazú y Acaray, que cambian la extensión del agua en el mapa;
  - para cada escenario, qué fichas quedan dentro, cerca o lejos del agua.
- **Hidrología:**
  - 25 estaciones hidrometeorológicas con series de lluvia, caudal, nivel, cota y meteorología;
  - el nivel medido del Yguazú mueve la extensión del embalse en el mapa;
  - proyección a 30 días con tres supuestos de lluvia;
  - umbrales de nivel que arman la lista de fichas a contactar.
- **Índice de vulnerabilidad hidrosocial (IVH):** ilustrativo, con el desglose de cada factor.
- **Exportación:** Excel con fichas, historial y diccionario; también GeoJSON y CSV, con opción de anonimizar.

## Qué es real y qué es simulado

| Componente | Estado |
|---|---|
| Fichas del censo (HS-…) | **Ficticias**, solo para demostración |
| Sitios visitados (SI-…) y encuestas de depleción (EN-…) | Reales, del equipo social |
| Estaciones hidrometeorológicas (ubicación y tipo) | Reales |
| Series de las estaciones | **Simuladas** (abr–oct 2026) |
| Escenarios de crecida Q700–Q2900 | Reales (KML del equipo, simplificados a ~4 m) |
| Niveles de los embalses y curva cota–área | **Simulados**, a reemplazar por las superficies del estudio |
| Contorno base del embalse Yguazú | Aproximado (Natural Earth), no coincide bien con la costa real |
| Límites distritales | geoBoundaries (CC BY 4.0) |

## Cómo reemplazar los datos simulados

- **Censo:** botón *Cargar entrega*. El formato está en *Cargar entrega → Descargar plantilla*.
- **Superficies de nivel del embalse:** panel *Escenarios de agua → pestaña del embalse → Cargar* (un KML, KMZ o GeoJSON por cota).
- **Datos de estaciones:** pestaña *Hidrología → Cargar datos de estaciones*, con un CSV o Excel con columnas `fecha, estacion, variable, valor`. La plantilla está en el mismo lugar.

## Estructura del repositorio

```
app/index.html        Visor listo para abrir (todo en un solo archivo)
fuente/               Plantilla HTML, módulos JS y script de armado (build.py)
datos/                Datos procesados (JSON) que se incrustan en la app
datos/kml/            KML/KMZ originales del equipo
datos/geo/            Límites administrativos (geoBoundaries)
scripts/              Scripts de Python que generan los datos y las simulaciones
ejemplos/             Archivos para demostrar la carga (entrega 2 ficticia, semana de datos de estaciones)
```

## Regenerar la app

Requiere Python 3 con `shapely`, `pyproj`, `numpy` y `openpyxl`. Los scripts se ejecutan desde una carpeta de trabajo que contenga los datos de entrada. El orden es:

1. `build_geo.py`
2. `gen_data.py`
3. `build_scen.py`
4. `sim_hydro.py`
5. `build_levels.py`
6. `build_sites.py`
7. `build_surveys.py`
8. `build.py`

`build.py` genera `censo_hidrosocial_independiente.html`, que es la app (`app/index.html`).

La capa de lagos de Natural Earth (`ne_10m_lakes.geojson`) no está incluida por tamaño. Se descarga del repositorio `nvkelso/natural-earth-vector`.

## Datos personales

El Excel original de las encuestas de depleción **no** está en este repositorio porque contiene nombres y teléfonos. Una versión institucional debería funcionar en un servidor de la ANDE, con usuarios, permisos por rol y respaldo, conforme a la Ley 1682/01.
