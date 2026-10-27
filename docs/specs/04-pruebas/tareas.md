# 04 · Pruebas — Tareas

- [ ] T-04-01 · Configurar Vitest workspace (api, web, contracts), cobertura v8 y umbrales → `vitest.workspace.ts`
- [ ] T-04-02 · Crear `db/seed/test_fixture.sql` con datos sintéticos y valores esperados documentados
- [ ] T-04-03 · Configurar pgTAP + `pg_prove` + scripts `db/scripts/{migrate,install-pgtap}.sh`
- [ ] T-04-04 · Escribir P-DB-01…P-DB-08
- [ ] T-04-05 · Escribir P-UNIT-01…P-UNIT-12 (junto con la tarea de desarrollo correspondiente; TDD recomendado para `core/adaptive`, `core/emotion`, `core/gamificacion`)
- [ ] T-04-06 · Escribir P-COMP-01…P-COMP-05 con fixtures por tipo de ejercicio
- [ ] T-04-07 · Escribir P-ROUTE-01…P-ROUTE-03
- [ ] T-04-08 · Configurar Supertest con BD real por suite (esquema aislado por worker) y mocks de IA (`aws-sdk-client-mock`, `msw`)
- [ ] T-04-09 · Escribir P-API-01…P-API-09 y P-INT-01, P-INT-02
- [ ] T-04-10 · Escribir P-SEC-01 generado desde la tabla de rutas (todas las rutas `/docente/**` con recurso de otro docente → 404)
- [ ] T-04-11 · Escribir P-SEC-02…P-SEC-06
- [ ] T-04-12 · `docker-compose.test.yml` (db + api con IA mock + web) para E2E
- [ ] T-04-13 · Escribir P-E2E-01…P-E2E-05 y P-A11Y-01 (Chromium con `--use-fake-device-for-media-stream`)
- [ ] T-04-14 · Stub HTTP de Rekognition/OpenAI con latencia configurable para k6
- [ ] T-04-15 · Escribir P-PERF-01…P-PERF-03 + `perf/seed.sql`
- [ ] T-04-16 · Workflows `ci.yml`, `perf-smoke.yml`, `deploy.yml`, `nightly.yml` y reglas de protección de rama
- [ ] T-04-17 · Preparar y ejecutar P-UX-01 (consentimientos de tutores para la sesión, guion, hoja de registro)
- [ ] T-04-18 · Prueba de humo con servicios reales en `staging` antes de release (lista de verificación)
