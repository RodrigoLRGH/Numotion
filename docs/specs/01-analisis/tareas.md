# 01 · Análisis — Tareas

| ID | Tarea | Entregable | Depende de | Estado |
|---|---|---|---|---|
| T-00-01 | Inventariar el repositorio `teds_project-main` (ver `00-contexto/estado-actual.md §2`) | Tabla de inventario llena + mapeo §4 | — | ✅ |
| T-00-02 | Buscar y retirar secretos del código (AWS, OpenAI) a `.env` / Secrets Manager | PR "chore: retirar secretos" + rotación de claves | T-00-01 | ✅ Sin secretos en el código (2026-10-27) |
| T-00-03 | Confirmar o reemplazar ADR-008 según el stack real | ADR-008 en estado *Aceptado* | T-00-01 | ✅ Reemplazado por ADR-010 (2026-10-27) |
| T-01-01 | Revisar requerimientos normalizados contra la matriz original | `requerimientos.md` sin discrepancias | — | ⬜ |
| T-01-02 | Validar ambigüedades A-01…A-16 con el docente stakeholder | Acta con decisión por ambigüedad | T-01-01 | ⬜ |
| T-01-03 | Validar la versión de PANAS-C a usar (ítems, escala, licencia/uso académico) y su adaptación al español para 6–12 años | Ítems definitivos en `seed` de `panas_item` | T-01-02 | ⬜ |
| T-01-04 | Validar banco del diagnóstico matemático por grado (mín. 3 preguntas por tema, niveles 1–5) | Banco en `seed` de `pregunta_diagnostico` | T-01-02 | ⬜ |
| T-01-05 | Validar catálogo de guías de actuación (RF-27) con docente/psicopedagogía | Contenido de `guia_actuacion` | T-01-02 | ⬜ |
| T-01-06 | Redactar aviso de privacidad y formato de consentimiento (LFPDPPP, LGDNNA) | Aviso v1 + flujo aprobado por revisión legal | — | ⬜ |
| T-01-07 | Corregir en el plan de negocios la afirmación de "procesamiento en navegador" (A-11) | Plan v6.1 | — | ⬜ |
| T-01-08 | Mantener actualizada la matriz de trazabilidad tras cualquier cambio | `03-matriz-de-trazabilidad.md` | continuo | ⬜ |

**Criterio de salida:** T-00-01, T-00-03, T-01-02 cerradas. T-01-03 a T-01-06 pueden cerrarse en paralelo con la fase de diseño, pero bloquean los `seed` de EXP-02 y EXP-05.
