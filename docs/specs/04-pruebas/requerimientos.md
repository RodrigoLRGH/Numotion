# 04 · Pruebas — Requerimientos de la fase

## Objetivo
Demostrar con evidencia automatizada (y una prueba de usabilidad manual) que cada requerimiento *Must* se cumple, y que las restricciones de privacidad de menores no se violan.

## Requerimientos con verificación obligatoria
| Requerimiento | Prueba que lo acredita | Criterio |
|---|---|---|
| RNF-01 | P-PERF-01 | p95 ≤ 2 s |
| RNF-02 | P-PERF-02 | p95 ≤ 30 s |
| RNF-03, RC-05 | P-SEC-03, P-INT-01, P-DB-08 (sin `bytea`) | 0 imágenes persistidas |
| RNF-04 | P-SEC-01, P-DB-04, P-ROUTE-01 | 0 accesos cruzados |
| RNF-06 | P-UX-01, P-A11Y-01 | ≥ 90 % éxito; 0 violaciones serias |
| RNF-10, RC-08 | P-SEC-04, P-ROUTE-03, P-E2E-01 | Sin consentimiento no hay uso |
| RI-09 | P-SEC-05 | HSTS + CSP presentes |
| RF *Must* | Ver `01-analisis/diseno/03-matriz-de-trazabilidad.md` | Cada RF con ≥ 1 prueba verde |

## Reglas
- Las pruebas que dependen de Rekognition/OpenAI usan mocks en CI; una prueba manual de humo con servicios reales se ejecuta en `staging` antes de cada release (con imágenes sintéticas o de adultos con licencia, **nunca** fotos de niños).
- Un bug encontrado en producción se reproduce primero como prueba fallida.

## Criterios de salida (release MVP)
1. CI verde en `main` con cobertura `core/**` ≥ 90 %.
2. P-PERF-01…03 verdes en `staging`.
3. P-UX-01 ≥ 90 %.
4. Revisión legal del aviso y flujo de consentimiento firmada (T-01-06).
