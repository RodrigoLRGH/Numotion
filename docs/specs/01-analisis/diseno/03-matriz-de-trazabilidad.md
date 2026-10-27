# Matriz de trazabilidad

Requerimiento → Caso de uso → Historia → Expect → Componente → Prueba.
Regla: ningún requerimiento *Must* puede quedar sin Expect **y** sin prueba. Actualizar en cada PR que cambie alcance (T-01-08).

## 1. Requerimientos funcionales

| RF | MoSCoW | Módulo | CU | HU | Expect | Componente principal | Pruebas |
|---|---|---|---|---|---|---|---|
| RF-01 | Must | core | CU-06, CU-07a | HU-14 | EXP-04.5, EXP-05.3 | `core/adaptive/decidirNivel` | P-UNIT-01, P-UNIT-07, P-DB-05 |
| RF-03 | Must | alumno | CU-06, CU-10 | HU-19 | EXP-06.1, EXP-04.10 | `core/gamificacion` | P-UNIT-09, P-E2E-01 |
| RF-10 | Must | alumno | CU-06 | HU-13 | EXP-04.2 | `alumno/ejercicios/*` | P-COMP-01 |
| RF-11 | Must | core/alumno | CU-06 | HU-15 | EXP-04.6 | `GuiaPasoAPaso` | P-COMP-02, P-API-02 |
| RF-14 | Must | docente | CU-03 | HU-07 | EXP-07.1 | `docente/ResumenPrevio` | P-API-03, P-E2E-02 |
| RF-16 | Must | docente/core | CU-07a, CU-07b | HU-17 | EXP-05.4, EXP-05.5 | `core/emotion/indiceFrustracion`, SSE | P-UNIT-02, P-API-07, P-E2E-03 |
| RF-18 | Must | docente | CU-09 | HU-29 | EXP-07.6 | `v_indice_tema` | P-API-05, P-PERF-02 |
| RF-19 | Must | docente | CU-08 | HU-25 | EXP-07.3 | `v_perfil_estadistico` | P-API-05 |
| RF-21 | Must | core | CU-06 | HU-14 | EXP-04.5 | `core/adaptive/decidirNivel` | P-UNIT-01 |
| RF-22 | Could | alumno | CU-10 | HU-23 | EXP-06.5 | `MensajeMotivacional` | P-COMP-03 |
| RF-27 | Must | docente/alumno | CU-07b | HU-18 | EXP-05.6 | `GuiaActuacion` | P-API-07, P-E2E-03 |
| RF-29 | Must | docente | CU-08 | HU-24 | EXP-07.2 | `docente/FichaAlumno` | P-API-06, P-SEC-01 |
| RF-35 | Must | docente | CU-08 | HU-27 | EXP-07.4, EXP-04.10 | `resultado_academico` | P-API-06 |
| RF-39 | Must | alumno | CU-06 | HU-13 | EXP-04.3 | `EjercicioNumeroAPalabras` | P-UNIT-03, P-COMP-01 |
| RF-40 | Could | alumno | CU-06 | HU-13 | EXP-04.3 | `EjercicioIdentificarNumero` | P-UNIT-04 |
| RF-41 | Could | alumno | CU-06 | HU-13 | EXP-04.3 | `EjercicioSumaFiguras` | P-UNIT-08 |
| RF-42 | Must | alumno | CU-06 | HU-13 | EXP-04.3 | `EjercicioCompletarOperacion` | P-UNIT-08, P-COMP-01 |
| RF-44 | Could | alumno | CU-06 | HU-13 | EXP-04.3 | `EjercicioColorearFigura` | P-UNIT-08 |
| RF-45 | Must | core/alumno | CU-06 | HU-15 | EXP-04.6 | `GuiaPasoAPaso` (modo final) | P-COMP-02 |
| RF-47 | Must | alumno | CU-06 | HU-12 | EXP-04.4 | `intento_ejercicio.tiempo_ms` | P-API-02 |
| RF-50 | Must | docente | CU-08 | HU-26 | EXP-07.5 | `nota_docente` | P-API-06 |
| RF-52 | Must | docente | CU-08 | HU-28 | EXP-07.4 | `v_cruce_academico_emocional` | P-API-06 |
| RF-54 | Must | alumno | CU-02 | HU-04 | EXP-02.1, EXP-02.5 | `PanasC` | P-UNIT-05, P-E2E-01 |
| RF-55 | Must | alumno | CU-02 | HU-05 | EXP-02.2, EXP-02.6 | `DiagnosticoMatematico` | P-UNIT-06, P-E2E-01 |
| RF-56 | Must | docente | CU-04 | HU-08 | EXP-03.1 | `FormularioAsignacion` | P-COMP-04, P-API-01 |
| RF-57 | Must | docente/core | CU-04 | HU-08 | EXP-03.2, EXP-03.3 | `fn_registrar_asignacion`, `fn_nivel_inicial` | P-API-01, P-DB-02, P-DB-06, P-PERF-03 |
| RF-58 | Must | docente | CU-05 | HU-09 | EXP-03.4 | `ListaActividades` | P-API-04 |
| RF-59 | Must | docente | CU-05 | HU-10 | EXP-03.5 | `HistorialActividades` | P-API-04 |
| RF-60 | Must | alumno | CU-06 | HU-12 | EXP-04.4 | `POST /alumno/intentos`, `trg_estado_asignacion` | P-API-02, P-DB-03 |
| RF-61 | Must | core | CU-02 | HU-06 | EXP-02.3 | `fn_generar_retroalimentacion` | P-API-03 |
| RF-62 | Must | docente | CU-03 | HU-07 | EXP-07.1 | `RetroalimentacionGrupo` | P-API-03 |
| RF-63 | Must | alumno | CU-02, CU-10 | HU-06 | EXP-02.4 | `PanelAlumno`, `RequireDiagnosticos` | P-ROUTE-02, P-E2E-01 |
| RF-64 | Must | alumno | CU-06 | HU-11 | EXP-04.1 | `MisActividades` | P-API-02, P-E2E-01 |
| RF-65 | Must | alumno | CU-10 | HU-22 | EXP-06.4 | `PerfilAlumno` | P-COMP-03 |
| RF-66 | Must | alumno | CU-10 | HU-20 | EXP-06.3 | `RachaVisual` | P-COMP-03 |
| RF-67 | Must | core | CU-10 | HU-21 | EXP-06.2, EXP-06.6 | `fn_registrar_practica`, `fn_racha_vigente` | P-DB-01 |
| RF-68 | Must | core | CU-10 | HU-21 | EXP-06.2 | `racha_alumno.mejor_racha` | P-DB-01 |

## 2. No funcionales, interfaz y restricciones

| ID | Expect | Componente | Pruebas |
|---|---|---|---|
| RNF-01 | EXP-04.8 | Validación local optimista + API | P-PERF-01 |
| RNF-02 | EXP-04.6, EXP-07.6 | Vistas materializadas, caché | P-PERF-02 |
| RNF-03 | EXP-05.1, EXP-05.2 | `EmotionGateway` | P-SEC-03, P-INT-01 |
| RNF-04 | EXP-01.2, EXP-01.3, EXP-03.6 | middleware `requireRole`, RLS | P-SEC-01, P-DB-04, P-ROUTE-01 |
| RNF-06 | EXP-04.2, EXP-01.4 | UI infantil, audio | P-UX-01, P-A11Y-01 |
| RNF-10 | EXP-01.5 | Consentimiento | P-SEC-04, P-ROUTE-03, P-E2E-01 |
| RI-01 | EXP-01.6 | Design tokens, a11y | P-A11Y-01 |
| RI-02 | EXP-05.1 | `useEmotionCapture` | P-E2E-04 |
| RI-03 | EXP-04.2 | Interacciones puntero/teclado | P-COMP-01 |
| RI-05 | EXP-04.9 | Cola offline | P-E2E-05 |
| RI-06 | EXP-05.2 | `EmotionGateway` | P-INT-01 |
| RI-07 | EXP-04.7 | `ContentGateway` | P-INT-02 |
| RI-09 | EXP-01.7 | HSTS, redirección, TLS CloudFront | P-SEC-05 |
| RC-01 | ADR-005, ADR-007 | — | Revisión de arquitectura |
| Refactorización en módulos (ADR-001) | EXP-01.1 | `eslint-plugin-boundaries` | Lint en CI |
| RC-02 | EXP-01.8 | IaC AWS | Pipeline de despliegue |
| RC-03 | EXP-05.1 | Guard de cámara | P-E2E-04 |
| RC-04 | EXP-05.2, EXP-04.7 | Muestreo, topes | P-INT-01, P-INT-02 |
| RC-05 | EXP-05.2 | = RNF-03 | P-SEC-03 |
| RC-07 | EXP-01.3, EXP-01.5, EXP-01.9 | Auditoría, ARCO, cifrado | P-SEC-01, P-SEC-06 |
| RC-08 | EXP-01.5 | = RNF-10 | P-SEC-04 |

## 3. Cobertura
- RF *Must*: 33/33 con Expect y prueba. RF *Could*: 4/4 con Expect (RF-22, RF-40, RF-41, RF-44, implementables al final).
- RNF/RI/RC: 20/20 con verificación.
