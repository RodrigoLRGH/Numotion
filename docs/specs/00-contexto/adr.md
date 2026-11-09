# Registro de Decisiones de Arquitectura (ADR)

Formato: Contexto · Decisión · Consecuencias · Estado. Una decisión aceptada solo se cambia con un ADR nuevo que la reemplace.

---

## ADR-001 · Monolito modular con módulos Docente, Alumno y Core
**Estado:** Aceptado
**Contexto:** El equipo es pequeño, con presupuesto limitado (RC-04) y el objetivo de la refactorización es separar dos módulos funcionales (docente y alumno). Microservicios multiplicarían costo operativo.
**Decisión:** Un solo backend desplegable con tres módulos internos (`docente`, `alumno`, `core`) y un solo frontend SPA con dos módulos de rutas. Regla de dependencias: `docente → core`, `alumno → core`; **`docente` y `alumno` nunca se importan entre sí**.
**Consecuencias:** Despliegue simple; límites forzados por lint (`eslint-plugin-boundaries`). Si un módulo crece, puede extraerse sin reescribir el dominio.

## ADR-002 · Procesamiento facial en memoria vía backend (sin persistencia)
**Estado:** Aceptado
**Contexto:** RI-06 exige Rekognition; RNF-03 y RC-05 prohíben almacenar imágenes. El plan de negocios (§2.1.6) habla de "procesamiento dentro del navegador", lo que contradice RI-06/RC-01.
**Decisión:** El navegador captura un frame (JPEG, ≤ 320 px de ancho, calidad 0.6), lo envía por HTTPS a `POST /api/v1/alumno/emociones/frame`; el backend llama a `DetectFaces` con `Image.Bytes` y `Attributes: ["EMOTIONS"]`, descarta el buffer y persiste solo `{emocion, confianza, estado_derivado}`. No se usa S3 para frames. Los logs nunca incluyen el body de esa ruta.
**Consecuencias:** Se debe corregir el texto del plan de negocios ("procesamiento en navegador" → "procesamiento en memoria, sin almacenamiento"). Auditoría técnica verifica ausencia de persistencia (prueba P-SEC-03).

## ADR-003 · PostgreSQL + Row Level Security como defensa en profundidad
**Estado:** Aceptado
**Contexto:** RNF-04: el docente solo ve datos de alumnos de sus grupos. RC-07 pide control de acceso y auditoría.
**Decisión:** PostgreSQL 16 en RDS (cifrado en reposo). La autorización se hace en la capa de servicio **y** en BD: cada transacción fija `SET LOCAL app.user_id` y `app.role`; las políticas RLS filtran por grupo.
**Consecuencias:** Un bug de servicio no expone datos ajenos. Las migraciones deben incluir políticas y pruebas de BD.

## ADR-004 · Acceso del alumno sin correo: código de grupo + avatar + PIN pictográfico
**Estado:** Aceptado
**Contexto:** Alumnos de 6–12 años no manejan correo/contraseña (RNF-06). RNF-04 exige autenticación al docente; para el alumno se necesita identificación sencilla pero no anónima.
**Decisión:** El docente genera un `codigo_acceso` de 6 caracteres por grupo. El alumno escribe el código, elige su avatar en una cuadrícula y toca una secuencia de 4 íconos (PIN pictográfico, hash bcrypt). Bloqueo de 5 minutos tras 5 intentos fallidos.
**Consecuencias:** Usable sin lectura avanzada. El token del alumno tiene alcance limitado (`role=alumno`, 4 h).

## ADR-005 · Motor adaptativo por reglas deterministas
**Estado:** Aceptado
**Contexto:** RC-01 prohíbe modelos propios de IA. El docente necesita entender por qué cambió el nivel.
**Decisión:** Función pura `decidirNivel(estado) → {nivelNuevo, motivo}` con reglas documentadas en `02-diseno/diseno/02-...md §3`. Cada cambio se registra en `ajuste_dificultad` con su motivo.
**Consecuencias:** 100 % testeable con tablas de verdad; umbrales configurables en `config_adaptativa`.

## ADR-006 · Alertas en tiempo real con Server-Sent Events
**Estado:** Aceptado
**Contexto:** RF-16 requiere alerta temprana; la comunicación es unidireccional (servidor → docente).
**Decisión:** `GET /api/v1/docente/alertas/stream` (SSE) con heartbeat cada 25 s; respaldo por sondeo cada 15 s si SSE falla.
**Consecuencias:** Más simple que WebSockets; compatible con CloudFront/ALB con timeout ≥ 60 s.

## ADR-007 · OpenAI como enriquecimiento opcional con respaldo de catálogo
**Estado:** Aceptado
**Contexto:** RI-07 es *Should have*; RC-04 limita presupuesto; RNF-02 fija 30 s.
**Decisión:** `ContentGateway.generarEjercicio()` con timeout de 20 s y caché por (tema, nivel, interés). Si falla o se excede el presupuesto mensual (`OPENAI_MONTHLY_BUDGET_USD`), se usa `ejercicio_plantilla` del catálogo. Al prompt **nunca** se envían nombre, grupo ni datos emocionales del alumno; solo tema, nivel e intereses genéricos.
**Consecuencias:** El sistema funciona completo sin OpenAI. Los ejercicios generados se validan (respuesta calculable) antes de mostrarse.

## ADR-008 · Stack tecnológico
**Estado:** Reemplazado por ADR-010 (2026-10-27).
**Decisión propuesta original:**
| Capa | Tecnología |
|---|---|
| Frontend | React 18, TypeScript 5, Vite, React Router 6, TanStack Query 5, Zustand, Tailwind CSS, dnd-kit (arrastrar) |
| Backend | Node.js 20, TypeScript, Express 4, Zod (validación), Prisma (ORM y migraciones) |
| BD | PostgreSQL 16 (RDS) |
| IA | AWS SDK v3 `@aws-sdk/client-rekognition`, `openai` SDK |
| Pruebas | Vitest, React Testing Library, Supertest, Playwright, pgTAP, k6 |
| CI/CD | GitHub Actions |
| Infra | S3 + CloudFront, App Runner (o ECS Fargate), RDS, Secrets Manager, CloudWatch |

## ADR-009 · Consentimiento parental bloqueante
**Estado:** Aceptado
**Contexto:** RNF-10, RC-07 (LFPDPPP), RC-08 (LGDNNA).
**Decisión:** Un alumno no puede iniciar sesión hasta que exista un `consentimiento_tutor` vigente (aceptado y no revocado) para la versión actual del aviso de privacidad. La cámara requiere un consentimiento específico (`acepta_camara = true`); sin él, el alumno usa la plataforma **sin detección facial** (adaptación solo por desempeño + PANAS-C).
**Consecuencias:** RC-03 (dispositivo con cámara) aplica solo a alumnos con consentimiento de cámara; se documenta como modo degradado.

## ADR-010 · Stack real: Astro + PostgreSQL + Vercel (reemplaza ADR-008)
**Estado:** Aceptado (2026-10-27, decisión del responsable tras T-00-01). La capa web/API (Astro) la **reemplaza ADR-011**; siguen vigentes PostgreSQL + RLS, sesiones opacas, scrypt, Vercel y el correo por Google Workspace.
**Contexto:** El inventario (T-00-01) mostró que el código usa Astro 5 SSR + Astro DB (libSQL) + Vercel, con dominio y API avanzados y sin pantallas. ADR-003 exige PostgreSQL con RLS, imposible en libSQL.
**Decisión:**
| Capa | Tecnología |
|---|---|
| Web + API | Astro 5 (`output: "server"`), islas React 19, Tailwind 4; endpoints en `src/pages/api/**`; guardas en `src/middleware.ts` |
| Validación | `astro/zod` |
| BD | **PostgreSQL 16** con RLS (ADR-003 se mantiene). Migraciones SQL versionadas en `db/migrations/*.sql` como fuente de verdad, aplicadas con `npm run db:migrar` |
| Acceso a datos | `postgres` (postgres.js) con SQL parametrizado; cada request abre una transacción y fija `app.user_id`/`app.role` (`withContext`). Sin ORM (reemplaza Prisma/T-02-08) |
| Alojamiento | **Vercel** (adaptador `@astrojs/vercel`) + PostgreSQL administrado compatible (Neon / Vercel Postgres / Supabase). Desviación de RC-02 (AWS) registrada; Rekognition sigue en AWS con credenciales IAM de mínimo privilegio |
| Correo | SMTP de **Google Workspace** (`smtp.gmail.com:465`, contraseña de aplicación) con `nodemailer`, detrás de la interfaz `ProveedorCorreo` (decisión del responsable, 2026-10-27). El relay SMTP de Workspace se descarta porque autoriza por IP y las de Vercel cambian |
| Pruebas | Vitest (unitarias y de BD contra PostgreSQL en Docker, en lugar de pgTAP), Playwright, k6 |
| CI/CD | GitHub Actions + Vercel |
**Consecuencias:**
- `astro:db` se retira; los servicios se reescriben sobre el esquema de `02-diseno/diseno/01-modelo…`.
- T-02-01 se adapta: no hay monorepo `apps/web`/`apps/api`; la estructura `src/modules/{docente,alumno,shared}` cumple ADR-001.
- T-02-08 (Prisma) y T-02-14/T-03-01-18 (IaC AWS) quedan sustituidas por la configuración de Vercel.
- Sesiones: se usan **sesiones opacas en BD** (cookie `HttpOnly`, token aleatorio, hash SHA-256 en `sesion_auth`) en lugar de JWT RS256. Cumplen lo que exige el spec (expiración, revocación en logout y al revocar consentimiento) sin manejar llaves. Duración: docente 8 h, alumno 4 h.
- Hash de contraseñas y PIN con `scrypt` de Node (sin dependencia nativa) en lugar de bcrypt.
- La app se conecta con el rol `numotion_app` (sin `BYPASSRLS`); las migraciones, con el rol dueño.

## ADR-011 · Stack del spec: SPA React + Vite y API Express (reemplaza la capa web/API de ADR-010)
**Estado:** Aceptado (2026-10-27, decisión del responsable del proyecto)
**Contexto:** El código se había conservado sobre Astro (ADR-010). El responsable pidió alinearlo con el stack del spec (ADR-008): SPA con React Router y backend Express separado.
**Decisión:** Monorepo con npm workspaces (`convenciones.md §3`):
| Paquete | Contenido |
|---|---|
| `apps/web` | SPA React 19 + Vite 6 + React Router 6 (`createBrowserRouter`), Tailwind 4. Rutas y guardas de `06-navegacion` (`RequireRole`, `RedirectIfAuth`, `RequireConsent`, `RequirePanas`, `RequireDiagnosticos`); módulos docente y alumno en trozos separados (code splitting) |
| `apps/api` | Express 4 + Zod. Módulos `core` (auth, consentimiento, sesión, http), `docente`, `alumno`; `infra` (db, correo, entorno). Errores con `ErrorHttp` y un manejador central |
| `packages/core` | Dominio puro compartido (reglas de diagnóstico, adaptación, puntos, catálogos, guardas). Sin dependencias de framework ni de BD |
| `db/`, `scripts/`, `tests/` | Sin cambios de ubicación |
**Se conserva de ADR-010:** PostgreSQL + RLS con `conContexto`, sesiones opacas en BD (cookie `HttpOnly; SameSite=Strict`), scrypt, Vercel, correo por Google Workspace.
**Desviaciones respecto de ADR-008:** React 19 (no 18); sin TanStack Query ni Zustand (estado local + `AuthProvider` bastan por ahora); sin Prisma (SQL parametrizado); arrastre sin dnd-kit (nativo + alternativa por toque). Se pueden incorporar si una pantalla lo justifica.
**Despliegue:** Vercel sirve `apps/web/dist` como estático y la API como función (`api/index.mjs`, que importa el bundle de `apps/api`); `vercel.json` reescribe `/api/*` a la función y el resto a `index.html`, y fija las cabeceras de seguridad del SPA.
**Consecuencias:** En desarrollo, Vite (:5173) hace de proxy de `/api` hacia Express (:3000): mismo origen, sin CORS. Las guardas del cliente son UX; la API valida todo de nuevo (`decidirAcceso`, RLS).

## ADR-012 · Prisma como capa de acceso a datos (T-02-08)
**Estado:** Aceptado (2026-10-27, decisión del responsable del proyecto)
**Contexto:** ADR-008 y T-02-08 piden Prisma con `prisma db pull` sobre las migraciones SQL. ADR-010/011 usaban postgres.js.
**Decisión:**
- **Prisma 6.19** (`prisma-client-js`, `binaryTargets` con `rhel-openssl-3.0.x` para Vercel). Prisma 7 se descartó por ahora: cambia a adaptadores obligatorios y `prisma.config.ts`, con menos recorrido.
- **Las migraciones SQL siguen siendo la fuente de verdad** (RLS, funciones, triggers, CHECK y permisos por columna no caben en Prisma Migrate). `apps/api/prisma/schema.prisma` se genera con `npm run db:pull` y no se edita a mano.
- `conContexto` usa transacciones interactivas de Prisma y fija `app.user_id`/`app.role` con `set_config(..., true)`.
- **API tipada** para el CRUD simple (configuración, ítems, sesiones, grupos, ejercicios, intentos, ajustes, puntos). **`$queryRaw`** para lo que Prisma no expresa: llamadas a funciones `SECURITY DEFINER`, reportes con agregados y `LATERAL`, mezcla `jsonb`, `FOR UPDATE` y la fecha local de la escuela (`fn_hoy_local`).
**Reglas (documentadas en `apps/api/src/infra/db.ts`):**
- En `$queryRaw` los parámetros string viajan como `text`: UUID y enums llevan cast explícito (`::uuid`, `::tipo_interaccion`).
- La app no puede leer `pin_hash`, `password_hash` ni `token_hash`: en esas tablas, `select` explícito siempre.
- En `alumno` y `consentimiento_tutor` el `INSERT` va en SQL: Prisma agrega al `INSERT` los valores por defecto del esquema y la app solo tiene permiso sobre ciertas columnas (protege contadores de bloqueo y la aceptación del tutor).
- Prisma no expone savepoints en transacciones interactivas: se usan `SAVEPOINT` explícitos donde se recupera de un `UNIQUE`.
- `numeric` llega como `Decimal`: los servicios devuelven `number` (p. ej. `resultadoFinal: 6.67`).
**Consecuencias:** postgres.js queda solo en pruebas y en `scripts/migrar.mjs` (rol dueño). En serverless con pooler (Neon/Supabase) la `DATABASE_URL` lleva `?pgbouncer=true&connection_limit=1`.
