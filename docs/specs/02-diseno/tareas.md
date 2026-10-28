# 02 · Diseño — Tareas

| ID | Tarea | Entregable | Depende de | Estado |
|---|---|---|---|---|
| T-02-01 | Crear monorepo `apps/web`, `apps/api`, `packages/contracts`, `db/` (o adaptar la estructura existente según T-00-01) | Estructura de `convenciones.md §3` + workspaces | T-00-03 | ✅ Monorepo npm workspaces `apps/web`, `apps/api`, `packages/core` (ADR-011) |
| T-02-02 | Configurar `eslint-plugin-boundaries` con la regla docente ↮ alumno | Lint falla si un módulo importa al otro | T-02-01 | ⬜ |
| T-02-03 | Escribir `db/migrations/0001_esquema.sql` (enums, tablas, índices, checks) | Migración aplicable en BD vacía | T-02-01 | ✅ |
| T-02-04 | Escribir `0002_funciones_triggers.sql` (calendario, racha, nivel inicial, registro de asignación, avance de asignación, retroalimentación, purga, anonimización, auditoría inmutable) | Migración + pgTAP básicos | T-02-03 | ✅ Pruebas en Vitest (`tests/db`) en lugar de pgTAP |
| T-02-05 | Escribir `0003_vistas.sql` (`v_estado_emocional_reciente`, `v_perfil_estadistico`, `mv_indice_tema_grupo`, `v_resultado_consolidado`, `v_cruce_academico_emocional`) | Migración | T-02-04 | ⬜ |
| T-02-06 | Escribir `0004_rls.sql` (roles `numotion_owner`/`numotion_app`, funciones `app_user/app_role/docente_puede_ver`, políticas por tabla) | Migración + P-DB-04 | T-02-03 | ✅ |
| T-02-07 | Escribir `0005_seed.sql`: temas, subtemas, ≥ 10 ejercicios por (tema, nivel) para tipos Must, PANAS-C (de T-01-03), banco diagnóstico (T-01-04), guías (T-01-05), insignias, mensajes, `config_adaptativa` | Seed reproducible | T-02-03, T-01-03…05 | ⬜ |
| T-02-08 | Configurar Prisma con `prisma db pull` sobre las migraciones SQL (las migraciones SQL son la fuente de verdad) | `schema.prisma` | T-02-06 | ➖ Sustituida por postgres.js con SQL parametrizado (ADR-010) |
| T-02-09 | Escribir esquemas Zod en `packages/contracts` para todos los endpoints de `05-contratos-de-api.md` + esquemas de `ejercicio.enunciado/respuesta` por tipo | Paquete compilando, tipos exportados | T-02-01 | ⬜ |
| T-02-10 | Generar `openapi.yaml` desde Zod | `docs/specs/02-diseno/openapi.yaml` | T-02-09 | ⬜ |
| T-02-11 | Implementar validadores compartidos por tipo (`packages/contracts/validadores`), incluido Levenshtein para RF-39 | Funciones puras + P-UNIT-03, P-UNIT-08 | T-02-09 | ⬜ |
| T-02-12 | Crear tokens de diseño (`styles/tokens.css`) y componentes base `shared/ui` conforme a RI-01 | Storybook o página `/_ui` | T-02-01 | ⬜ |
| T-02-13 | Revisar wireframes con docente y 2–3 alumnos (prueba de pasillo) | Notas + ajustes a `07-wireframes` | — | ⬜ |
| T-02-14 | Definir infraestructura AWS como código (CDK o Terraform): VPC, RDS, App Runner/ECS, S3+CloudFront, Secrets Manager, rol IAM con `rekognition:DetectFaces` | `infra/` + entorno `dev` | T-00-03 | ➖ Sustituida por Vercel + PostgreSQL administrado (ADR-010) |
