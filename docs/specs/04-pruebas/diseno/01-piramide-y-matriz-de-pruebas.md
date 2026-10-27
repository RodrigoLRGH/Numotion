# Pirámide y matriz de pruebas

## 1. Pirámide

```
                 ▲  P-UX-01 usabilidad (manual, 10 alumnos)
                ▲▲▲  E2E Playwright (P-E2E-01…05) + a11y (P-A11Y-01)
              ▲▲▲▲▲▲  Rendimiento k6 (P-PERF-01…03) · Seguridad (P-SEC-01…06)
           ▲▲▲▲▲▲▲▲▲▲  API/integración Supertest + BD real (P-API-*, P-INT-*)
        ▲▲▲▲▲▲▲▲▲▲▲▲▲▲  BD pgTAP (P-DB-*) · Rutas (P-ROUTE-*) · Componentes RTL (P-COMP-*)
     ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲  Unitarias Vitest de funciones puras (P-UNIT-*)
```
Objetivos de cobertura: `core/**` ≥ 90 % líneas (motor adaptativo, emoción, gamificación, validadores = 100 % ramas); resto ≥ 70 %.

## 2. Matriz de pruebas

| ID | Tipo | Qué verifica | Requerimientos | Herramienta | Archivo |
|---|---|---|---|---|---|
| P-UNIT-01 | Unit | `decidirNivel`: tabla de verdad de R0–R5, límites 1 y 5, mismo tema | RF-01, RF-21 | Vitest | `api/src/modules/core/adaptive/decidirNivel.test.ts` |
| P-UNIT-02 | Unit | Índice de frustración con/sin cámara; regla de 2 evaluaciones + cooldown | RF-16 | Vitest | `core/emotion/indiceFrustracion.test.ts`, `core/alertas/evaluarAlerta.test.ts` |
| P-UNIT-03 | Unit | Normalización + Levenshtein RF-39 (quinse ✓, cinco≠quince ✗, acentos, mayúsculas) | RF-39 | Vitest | `packages/contracts/validadores/numeroAPalabras.test.ts` |
| P-UNIT-04 | Unit | Generador de números no consecutivos (propiedad, 1 000 corridas) | RF-40 | Vitest + fast-check | `…/identificarNumero.test.ts` |
| P-UNIT-05 | Unit | `calcularPanas`, `estadoInicialDesdePanas` | RF-54, RF-61 | Vitest | `core/diagnostico/panas.test.ts` |
| P-UNIT-06 | Unit | Selección escalonada y `nivelDominio` | RF-55 | Vitest | `core/diagnostico/matematico.test.ts` |
| P-UNIT-07 | Unit | Mapeo emoción Rekognition → estado; estado de ventana; desinterés | RF-01 | Vitest | `core/emotion/derivarEstado.test.ts` |
| P-UNIT-08 | Unit | Validadores de suma con figuras, completar operación (+−×÷), colorear; `clasificarError` | RF-41, RF-42, RF-44, RF-19 | Vitest | `…/validadores/*.test.ts` |
| P-UNIT-09 | Unit | Puntos, niveles `50·n·(n−1)`, reglas de insignias | RF-03 | Vitest | `core/gamificacion/*.test.ts` |
| P-UNIT-10 | Unit | Validación de variables de entorno | — | Vitest | `infra/config.test.ts` |
| P-UNIT-11 | Unit | `seleccionarEjercicio` (tema, tipo, nivel, no repetir, fallback) | RF-21 | Vitest | `core/content/seleccionarEjercicio.test.ts` |
| P-UNIT-12 | Unit | Mensaje motivacional (condición, placeholders, no repetir) | RF-22 | Vitest | `core/gamificacion/mensajes.test.ts` |
| P-COMP-01 | Componente | Cada tipo de ejercicio: render, interacción con puntero **y** teclado, `onResponder` | RF-10, RF-39–RF-44, RI-03 | RTL + user-event | `web/src/modules/alumno/ejercicios/*.test.tsx` |
| P-COMP-02 | Componente | `GuiaPasoAPaso`: un paso a la vez; modo final muestra respuesta | RF-11, RF-45 | RTL | `…/GuiaPasoAPaso.test.tsx` |
| P-COMP-03 | Componente | `RachaVisual`, `PerfilAlumno` (sin datos emocionales), `MensajeMotivacional` | RF-65, RF-66, RF-22 | RTL | `…/components/*.test.tsx` |
| P-COMP-04 | Componente | `FormularioAsignacion`: destino excluyente, previsualización; `NotaRapida` | RF-56, RF-50 | RTL | `web/src/modules/docente/components/*.test.tsx` |
| P-COMP-05 | Componente | `EscalaCaritas` con audio y teclado | RF-54, RNF-06 | RTL | `…/EscalaCaritas.test.tsx` |
| P-ROUTE-01 | Rutas | Guardas por rol: docente↛alumno, alumno↛docente, sin sesión → login | RNF-04 | RTL + MemoryRouter | `web/src/app/router.test.tsx` |
| P-ROUTE-02 | Rutas | `RequireDiagnosticos` y `RequirePanas`; cambio de día | RF-63 | RTL | `…/guards.test.tsx` |
| P-ROUTE-03 | Rutas | `RequireConsent` → `/alumno/sin-permiso` | RNF-10 | RTL | `…/guards.test.tsx` |
| P-API-01 | API | Crear actividad: N asignaciones, nivel inicial, 422 excluyente, 404 ajeno | RF-56, RF-57 | Supertest + PG | `api/test/actividades.test.ts` |
| P-API-02 | API | Intentos: registro, idempotencia, estados, guía en intento 3/4, ajuste de nivel, tiempo | RF-60, RF-47, RF-11, RF-45, RF-64 | Supertest | `api/test/intentos.test.ts` |
| P-API-03 | API | Diagnósticos → retroalimentación; `DIAGNOSTICOS_PENDIENTES`; resumen previo | RF-54, RF-55, RF-61, RF-62, RF-14 | Supertest | `api/test/diagnosticos.test.ts`, `resumen.test.ts` |
| P-API-04 | API | Lista de asignadas y historial con filtros/cursor | RF-58, RF-59 | Supertest | `api/test/seguimiento.test.ts` |
| P-API-05 | API | Perfil estadístico y reporte de temas (valores contra dataset fijo) | RF-19, RF-18 | Supertest | `api/test/reportes.test.ts` |
| P-API-06 | API | Ficha, notas, resultados, consolidado, cruce | RF-29, RF-50, RF-35, RF-52 | Supertest | `api/test/fichaAlumno.test.ts` |
| P-API-07 | API | Alertas: creación, SSE, atender, respuesta del alumno | RF-16, RF-27 | Supertest + eventsource | `api/test/alertas.test.ts` |
| P-API-08 | API | Alta de grupos y alumnos, invitación de consentimiento | RNF-10 | Supertest | `api/test/grupos.test.ts` |
| P-API-09 | API | Panel del alumno (racha vigente, insignias, gamificación) | RF-63, RF-66 | Supertest | `api/test/panel.test.ts` |
| P-DB-01 | BD | Racha: casos de `02-…§2` + concurrencia | RF-67, RF-68 | pgTAP | `db/tests/racha.sql` |
| P-DB-02 | BD | `fn_nivel_inicial` | RF-57 | pgTAP | `db/tests/nivel_inicial.sql` |
| P-DB-03 | BD | `trg_intento_asignacion`: pendiente→en_curso→completada, resultado, `resultado_academico` | RF-60, RF-35 | pgTAP | `db/tests/asignacion_trigger.sql` |
| P-DB-04 | BD | RLS: docente A no ve datos de B; alumno solo lo propio; alumno no lee `evento_emocional` | RNF-04 | pgTAP | `db/tests/rls.sql` |
| P-DB-05 | BD | CHECK de niveles 1–5 | RF-01 | pgTAP | `db/tests/checks.sql` |
| P-DB-06 | BD | `UNIQUE(actividad_id, alumno_id)`, destino excluyente | RF-56, RF-57 | pgTAP | `db/tests/checks.sql` |
| P-DB-07 | BD | Purga 180 días y `fn_anonimizar_alumno` | RC-07 | pgTAP | `db/tests/retencion.sql` |
| P-DB-08 | BD | Vistas y vista materializada contra dataset fijo | RF-18, RF-19, RF-52 | pgTAP | `db/tests/vistas.sql` |
| P-INT-01 | Integración | `EmotionGateway` con Rekognition mockeado (aws-sdk-client-mock): bytes enviados, buffer en ceros, sin escrituras | RI-06, RNF-03 | Vitest | `core/emotion/emotionGateway.test.ts` |
| P-INT-02 | Integración | `ContentGateway`: sin PII en el prompt, timeout → catálogo, presupuesto, validación | RI-07, RC-04 | Vitest + msw | `core/content/contentGateway.test.ts` |
| P-SEC-01 | Seguridad | Acceso cruzado entre docentes en **todos** los endpoints `/docente/**` (test generado por tabla de rutas) | RNF-04, RC-07 | Supertest | `api/test/security/crossTenant.test.ts` |
| P-SEC-02 | Seguridad | Login: bloqueo, rate-limit, expiración, refresh rotativo | RNF-04 | Supertest | `api/test/security/auth.test.ts` |
| P-SEC-03 | Seguridad | No persistencia biométrica: 100 frames → ninguna columna/objeto/archivo con imagen | RNF-03, RC-05 | Supertest + script | `api/test/security/biometria.test.ts` |
| P-SEC-04 | Seguridad | Consentimiento: sin él no hay login; revocación cierra sesión; cámara separada | RNF-10, RC-08 | Supertest | `api/test/security/consentimiento.test.ts` |
| P-SEC-05 | Seguridad | Cabeceras HSTS, CSP, Permissions-Policy, redirección HTTPS | RI-09 | Supertest + curl en staging | `api/test/security/headers.test.ts` |
| P-SEC-06 | Seguridad | Logs sin PII ni body de frames | RNF-03, RC-07 | Vitest (captura de logger) | `api/test/security/logs.test.ts` |
| P-E2E-01 | E2E | Alumno: consentimiento → entrar → PANAS → diagnóstico → panel → actividad completa → recompensa → práctica → racha | Flujo alumno | Playwright | `tests/e2e/alumno.e2e.ts` |
| P-E2E-02 | E2E | Docente: login → resumen → asignar a grupo → ver avance → historial | Flujo docente | Playwright | `tests/e2e/docente.e2e.ts` |
| P-E2E-03 | E2E | Alerta: alumno con errores + frustración simulada → docente recibe alerta → guía → atendida; alumno acepta ayuda → nivel baja | RF-16, RF-27 | Playwright (2 contextos) | `tests/e2e/alerta.e2e.ts` |
| P-E2E-04 | E2E | Cámara: permitida (cámara falsa), denegada, sin consentimiento de cámara | RI-02, RC-03 | Playwright (`--use-fake-device-for-media-stream`) | `tests/e2e/camara.e2e.ts` |
| P-E2E-05 | E2E | Offline: intentos encolados y sincronizados sin duplicar | RI-05 | Playwright (`context.setOffline`) | `tests/e2e/offline.e2e.ts` |
| P-PERF-01 | Rendimiento | p95 ≤ 2 s en `POST /alumno/intentos` y `GET …/siguiente` con 300 alumnos concurrentes | RNF-01 | k6 | `perf/interaccion.js` |
| P-PERF-02 | Rendimiento | p95 ≤ 30 s en guía, resumen y reportes | RNF-02 | k6 | `perf/generacion.js` |
| P-PERF-03 | Concurrencia | 30 alumnos enviando intentos a la vez + docente asignando a 40; sin deadlocks ni filas perdidas | RF-57, RF-60, RF-67 | k6 + pgbench | `perf/concurrencia.js` |
| P-A11Y-01 | Accesibilidad | axe-core sin violaciones *serious/critical* en todas las páginas | RI-01, RNF-06 | @axe-core/playwright | `tests/e2e/a11y.e2e.ts` |
| P-UX-01 | Usabilidad | 10 alumnos, sin instrucción, completan escribir número / encontrar número / (colorear); éxito ≥ 90 % | RNF-06 | Protocolo manual | Protocolo en `02-pruebas-unitarias-y-de-componentes-vitest.md §7` |

## 3. Datos de prueba
- `db/seed/test_fixture.sql`: 2 docentes, 3 grupos, 45 alumnos (con y sin consentimiento de cámara), 2 semanas de intentos y eventos sintéticos con distribución conocida (para verificar vistas con valores exactos).
- Nunca usar fotos reales de niños; los frames de prueba son imágenes sintéticas o de adultos con licencia.
