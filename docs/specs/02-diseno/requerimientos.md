# 02 · Diseño — Requerimientos de la fase

## Objetivo
Convertir los requerimientos normalizados (`01-analisis`) en un diseño técnico implementable: modelo de datos, reglas de negocio, seguridad, arquitectura del frontend, contratos de API, navegación y wireframes.

## Requerimientos que esta fase debe resolver en diseño
| Área | Requerimientos | Documento |
|---|---|---|
| Datos | Todos los RF (persistencia), RF-35, RF-47, RF-67, RF-68, RNF-03 | `diseno/01-modelo-de-datos-…` |
| Reglas | RF-01, RF-16, RF-21, RF-57, RF-60, RF-61, RF-67, RF-68, RF-03, RF-11, RF-45 | `diseno/02-funciones-triggers-y-reglas-…` |
| Seguridad | RNF-03, RNF-04, RNF-10, RI-09, RC-05, RC-07, RC-08 | `diseno/03-seguridad-rls-resumen.md` |
| Frontend | RI-01, RI-02, RI-03, RNF-01, RNF-06 | `diseno/04-arquitectura-frontend.md` |
| API | Todos los RF; RI-06, RI-07 | `diseno/05-contratos-de-api.md` |
| Navegación | RF-63 (desbloqueo), RNF-04, RNF-10 | `diseno/06-navegacion-…` |
| UI | RF-14, RF-63, RF-64, RF-65, RF-66, RNF-06 | `diseno/07-wireframes-estructura.md` |

## Restricciones de diseño
- RC-01: sin modelos propios de IA; Rekognition y OpenAI por gateway desacoplado.
- RC-02: todo desplegable en AWS.
- RC-04: cada llamada externa tiene tope y métrica.
- RC-05: ningún esquema ni bucket admite imágenes faciales.

## Criterios de entrada/salida
- **Entrada:** fase 01 cerrada (T-00-01, T-00-03, T-01-02).
- **Salida:** migraciones 0001–0005 escritas y aplicables en una BD vacía; `packages/contracts` con todos los esquemas; `openapi.yaml` generado; wireframes revisados con el docente.
