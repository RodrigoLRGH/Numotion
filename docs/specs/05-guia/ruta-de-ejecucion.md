# Ruta de ejecución

Orden recomendado. Cada paso lista tareas; 🔀 = paralelizable con el paso marcado. Un paso no empieza hasta que sus dependencias estén ✅.

## Etapa 0 · Preparación (día 1–2)
| Paso | Tareas | Resultado verificable |
|---|---|---|
| 0.1 | T-00-01 | `estado-actual.md` §2 y §4 llenos |
| 0.2 | T-00-02 | Sin secretos en el repo (gitleaks limpio), claves rotadas |
| 0.3 | T-00-03 | ADR-008 *Aceptado* |
| 0.4 🔀 | T-01-01, T-01-02 | Ambigüedades validadas o con interpretación vigente |
| 0.5 🔀 | T-01-03, T-01-04, T-01-05, T-01-06, T-01-07 | Contenido de seeds y aviso (pueden seguir en paralelo con Etapa 1) |

## Etapa 1 · Cimientos (semana 1)
| Paso | Tareas | Resultado verificable |
|---|---|---|
| 1.1 | T-02-01, T-02-02 | Monorepo; lint bloquea imports cruzados |
| 1.2 | T-02-03 → T-02-04 → T-02-05 → T-02-06 | Migraciones aplican en BD vacía |
| 1.3 🔀 1.2 | T-02-09, T-02-10, T-02-11 | `packages/contracts` compila; P-UNIT-03, P-UNIT-08 verdes |
| 1.4 | T-02-07, T-02-08 | Seed + Prisma |
| 1.5 🔀 | T-04-01, T-04-02, T-04-03 | Infra de pruebas lista |
| 1.6 | T-04-16 (solo `ci.yml`) | CI corre en PR |
| 1.7 🔀 | T-02-12, T-02-13, T-02-14 | Tokens UI revisados con wireframes; entorno AWS `dev` |
| 1.8 | T-03-01-01 | Código existente movido a la estructura de módulos sin regresiones |

## Transversal (durante las etapas 2–8)
- Las pruebas se escriben **junto con** cada tarea de desarrollo (TDD): T-04-04 (BD), T-04-05 (unitarias), T-04-06 (componentes), T-04-07 (rutas), T-04-08 y T-04-09 (API/integración), T-04-10 y T-04-11 (seguridad). Cada etapa termina con su fila ✔.
- T-01-08: actualizar la matriz de trazabilidad en cada PR que cambie alcance.

## Etapa 2 · Acceso (semana 2) — EXP-01
| Paso | Tareas |
|---|---|
| 2.1 | T-03-01-02, T-03-01-03, T-03-01-04, T-03-01-17 |
| 2.2 | T-03-01-05, T-03-01-06, T-03-01-07, T-03-01-08 |
| 2.3 | T-03-01-09, T-03-01-10 |
| 2.4 🔀 2.3 | T-03-01-11, T-03-01-12, T-03-01-13, T-03-01-14 |
| 2.5 | T-03-01-15, T-03-01-16, T-03-01-18 |
| ✔ | P-SEC-01, P-SEC-02, P-SEC-04, P-SEC-05, P-DB-04, P-ROUTE-01, P-ROUTE-03 verdes |

## Etapa 3 · Diagnósticos (semana 3) — EXP-02
| Paso | Tareas |
|---|---|
| 3.1 | T-03-02-01, T-03-02-03 (TDD) |
| 3.2 | T-03-02-02, T-03-02-04, T-03-02-05, T-03-02-06 |
| 3.3 🔀 3.2 | T-03-02-07, T-03-02-08, T-03-02-09, T-03-02-10 |
| ✔ | P-UNIT-05, P-UNIT-06, P-API-03, P-ROUTE-02 verdes |

## Etapa 4 · Asignación (semana 3–4) — EXP-03  🔀 Etapa 5.1
| Paso | Tareas |
|---|---|
| 4.1 | T-03-03-01, T-03-03-02, T-03-03-03 |
| 4.2 | T-03-03-04, T-03-03-05 |
| 4.3 🔀 4.2 | T-03-03-06, T-03-03-07, T-03-03-08 |
| ✔ | P-API-01, P-API-04, P-DB-02, P-DB-06, P-COMP-04 verdes |

## Etapa 5 · Motor de ejercicios (semanas 4–6) — EXP-04
| Paso | Tareas |
|---|---|
| 5.1 | T-03-04-02, T-03-04-03, T-03-04-04 (funciones puras, TDD) |
| 5.2 | T-03-04-07, T-03-04-05, T-03-04-06, T-03-04-08, T-03-04-01 |
| 5.3 🔀 5.2 | T-03-04-09, T-03-04-10, T-03-04-11, T-03-04-12, T-03-04-13 (Must) |
| 5.4 | T-03-04-17, T-03-04-18, T-03-04-19, T-03-04-21 |
| 5.5 (Could, al final) | T-03-04-14, T-03-04-15, T-03-04-16 |
| 5.6 (Should) | T-03-04-20 |
| ✔ | P-UNIT-01, P-UNIT-11, P-API-02, P-DB-03, P-COMP-01, P-COMP-02, P-E2E-05 verdes |

## Etapa 6 · Emoción y alertas (semanas 6–7) — EXP-05
| Paso | Tareas |
|---|---|
| 6.1 | T-03-05-02, T-03-05-03, T-03-05-05 (TDD) |
| 6.2 | T-03-05-01, T-03-05-04 |
| 6.3 | T-03-05-06, T-03-05-07, T-03-05-08 |
| 6.4 🔀 6.3 | T-03-05-09, T-03-05-10, T-03-05-11 |
| 6.5 | T-03-05-12 |
| ✔ | P-UNIT-02, P-UNIT-07, P-INT-01, P-SEC-03, P-SEC-06, P-API-07, P-E2E-03, P-E2E-04 verdes |

## Etapa 7 · Gamificación (semana 7) — EXP-06  🔀 Etapa 6
| Paso | Tareas |
|---|---|
| 7.1 | T-03-06-01, T-03-06-02, T-03-06-05 |
| 7.2 | T-03-06-03, T-03-06-04 |
| 7.3 | T-03-06-06, T-03-06-07 |
| ✔ | P-UNIT-09, P-UNIT-12, P-DB-01, P-API-09, P-COMP-03 verdes |

## Etapa 8 · Dashboard docente (semanas 7–8) — EXP-07  🔀 Etapa 7
| Paso | Tareas |
|---|---|
| 8.1 | T-03-07-01, T-03-07-02 |
| 8.2 | T-03-07-03, T-03-07-04, T-03-07-05, T-03-07-06, T-03-07-07 |
| 8.3 | T-03-07-08, T-03-07-09 |
| ✔ | P-API-05, P-API-06, P-DB-08, P-E2E-02 verdes |

## Etapa 9 · Endurecimiento y release (semana 9)
| Paso | Tareas |
|---|---|
| 9.1 | T-04-12, T-04-13 (E2E completos + a11y) |
| 9.2 | T-04-14, T-04-15 (rendimiento en staging) |
| 9.3 | T-04-16 (resto de workflows) |
| 9.4 | T-04-17 (P-UX-01) → iterar UI si < 90 % |
| 9.5 | T-04-18 (humo con servicios reales) |
| 9.6 | Release `v1.0.0` a producción con aprobación manual |

## Camino crítico
`T-00-01 → T-00-03 → T-02-01 → T-02-03 → T-02-04 → T-02-06 → EXP-01 → EXP-02 → EXP-03 → EXP-04 → EXP-05 → Etapa 9`
