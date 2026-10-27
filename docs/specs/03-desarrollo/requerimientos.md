# 03 · Desarrollo — Requerimientos de la fase

## Objetivo
Implementar la refactorización en **dos módulos funcionales** (Docente y Alumno) sobre un núcleo común, cumpliendo los Expects EXP-01…EXP-07.

## Expects y su alcance
| Expect | Módulo | Requerimientos | Prioridad de implementación |
|---|---|---|---|
| EXP-01 Base, auth, consentimiento | core + ambos | RNF-04, RNF-06, RNF-10, RI-01, RI-09, RC-02, RC-07, RC-08 | 1 |
| EXP-02 Diagnósticos | alumno + core | RF-54, RF-55, RF-61, RF-63 | 2 |
| EXP-03 Asignación y seguimiento | docente | RF-56, RF-57, RF-58, RF-59 | 3 |
| EXP-04 Motor de ejercicios y adaptación | alumno + core | RF-01, RF-10, RF-11, RF-21, RF-39–RF-45, RF-47, RF-60, RF-64, RNF-01, RNF-02, RI-03, RI-05, RI-07 | 4 |
| EXP-05 Emoción y alertas | core + docente + alumno | RF-16, RF-27, RI-02, RI-06, RNF-03, RC-03, RC-04, RC-05 | 5 |
| EXP-06 Gamificación | alumno + core | RF-03, RF-22, RF-65, RF-66, RF-67, RF-68 | 6 (paralelizable con 5) |
| EXP-07 Dashboard docente | docente | RF-14, RF-18, RF-19, RF-29, RF-35, RF-50, RF-52, RF-62 | 7 (paralelizable con 6) |

## Reglas para quien implementa
1. Un PR = una o pocas tareas `T-03-…` relacionadas; referencia sus IDs y RF.
2. Ninguna tarea se marca hecha sin sus pruebas de `04-pruebas` en verde.
3. No se introduce lógica de negocio en componentes React: va en `core` (api) o en hooks del módulo (web).
4. Ningún import entre `modules/docente` y `modules/alumno`.
5. Ante una contradicción entre specs, prevalece: requerimientos.md (01) → modelo/reglas (02) → expects (03); registrar la contradicción en `00-contexto/estado-actual.md`.

## Criterios de entrada/salida
- **Entrada:** migraciones 0001–0005 y `packages/contracts` (fase 02).
- **Salida:** todos los EXP con estado ✅ en `estado-actual.md`; P-E2E-01…05 en verde en `staging`.
