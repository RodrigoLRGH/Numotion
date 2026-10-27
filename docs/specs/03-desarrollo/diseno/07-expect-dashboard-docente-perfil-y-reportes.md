# EXP-07 · Dashboard docente: resumen previo, ficha, perfil estadístico, consolidación, cruce, notas y reportes

**Cubre:** RF-14, RF-62, RF-29, RF-19, RF-35, RF-52, RF-50, RF-18, RNF-02 · **HU:** HU-07, HU-24…HU-29 · **Depende de:** EXP-02, EXP-04, EXP-05

## Objetivo
Dar al docente en un solo lugar la situación emocional y académica de cada alumno y del grupo, para decidir seguimiento y asignaciones sin trabajo extra de análisis.

## Expectativas verificables

| ID | Se espera que… | Verificación |
|---|---|---|
| EXP-07.1 | Al abrir `/docente`, el resumen previo muestre para el grupo seleccionado: alumnos con diagnóstico hoy/total, distribución de estado inicial, AP/AN promedio y dominio promedio por tema; y por alumno su último estado, AP, AN y dominio, marcando "sin datos hoy" con la fecha del último dato (A-09). p95 ≤ 2 s con 40 alumnos. | P-API-03, P-E2E-02 |
| EXP-07.2 | La ficha del alumno muestre desempeño, estado emocional reciente (serie de la última sesión) y últimas notas; cada apertura se audite. | P-API-06, P-SEC-01 |
| EXP-07.3 | El perfil estadístico muestre por tema: tiempo promedio, intentos promedio, % aciertos, errores por tipo y 3 subtemas de menor dominio (mín. 5 intentos). | P-API-05 |
| EXP-07.4 | El docente capture calificaciones de tareas, trabajos en clase e interrogaciones por tema (0–10); el consolidado combine esas capturas con `actividad_numotion`; el cruce por tema muestre promedio académico vs % frustración y AN, resaltando coincidencias (promedio < 6 y frustración > 30 %). | P-API-06 |
| EXP-07.5 | Las notas rápidas se guarden con 3 campos (fecha automática, texto 1–500, etiqueta opcional) en ≤ 2 clics desde la ficha o desde una alerta. | P-API-06, P-COMP-04 |
| EXP-07.6 | El reporte grupal liste temas/subtemas ordenados por índice de error o de frustración en un periodo, exportable a CSV, generado en ≤ 30 s (objetivo ≤ 3 s con la vista materializada). | P-API-05, P-PERF-02 |

## Componentes
- API: `modules/docente/{resumen, alumnos, notas, resultados, reportes}.routes.ts`; consultas sobre las vistas de `01-modelo §4`.
- Web: `pages/{PanelDocente, FichaAlumno, Reportes}`, `components/{ResumenPrevio, DistribucionEmocional, TablaAlumnosEstado, PerfilEstadistico, CruceTemaChart, CapturaResultado, NotaRapida}`; gráficos con Recharts (colores accesibles + etiquetas, nunca solo color).

## Lenguaje
Los textos al docente describen **señales observadas**, no diagnósticos ("mostró señales de frustración en 3 ejercicios", no "está deprimido"). Disclaimer en la ficha: "Los estados emocionales son estimaciones automáticas de apoyo y no sustituyen el criterio docente."
