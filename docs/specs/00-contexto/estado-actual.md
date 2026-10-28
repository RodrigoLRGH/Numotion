# Estado actual

> **Importante para el agente:** estas especificaciones se escribieron **a partir de la matriz de requerimientos y el plan de negocios, sin revisar el código de `teds_project-main`.** La primera tarea de cualquier agente es **T-00-01: inventario del repositorio** (abajo) y actualizar este archivo antes de tocar código.

## 1. Estado del proyecto

| Aspecto | Estado |
|---|---|
| Requerimientos | Matriz de clasificación v actual (37 RF, 6 RNF, 7 RI, 7 RC) |
| SDD y specs | v1.0 — este documento |
| Código | Inventariado (T-00-01, 2026-10-27). Backend de dominio y API avanzados; **sin pantallas** |
| Stack | **ADR-010 aceptado**: Astro 5 SSR + PostgreSQL 16 (RLS) + Vercel. Migración desde Astro DB en curso (§9) |
| Despliegue | Por definir (AWS, RC-02) |

## 2. T-00-01 · Inventario del repositorio (obligatorio primero)

El agente debe llenar esta tabla inspeccionando el repositorio:

| Pregunta | Respuesta |
|---|---|
| Lenguajes y framework del frontend | TypeScript 5 (strict, `astro/tsconfigs/strict`). **Astro 5** con `output: "server"` + `@astrojs/react` (React 19) + Tailwind CSS 4 (`@tailwindcss/vite`). No es SPA: no hay React Router, TanStack Query ni Zustand. |
| Framework del backend (o BaaS: Supabase/Firebase) | Endpoints de Astro (`src/pages/api/**`) + `src/middleware.ts`. Validación con `astro/zod`. Adaptador `@astrojs/vercel` (despliegue en Vercel, no AWS). Sin Express. |
| Base de datos y ORM / migraciones existentes | **Astro DB** (libSQL/SQLite, Drizzle por debajo). Esquema en `db/config.ts` con 15 tablas: Usuario, Sesion, Grupo, Alumno, Tema, DiagnosticoPanas, DiagnosticoMatematico, Actividad, AsignacionAlumno, SesionPractica, Intento, RegistroEmocion, Alerta, Nota, InsigniaAlumno. Sin migraciones SQL versionadas (Astro DB usa `db push`). Sin PostgreSQL ni RLS. |
| ¿Existe autenticación? ¿Qué proveedor? | Propia: usuario/contraseña con scrypt + sesión opaca en cookie `ff_sesion` (httpOnly, 8 h; en BD solo el hash SHA-256). Bloqueo de 5 fallos/15 min **en memoria** (no sobrevive entre instancias serverless). El alumno entra con usuario+contraseña creados por el docente (**no** código+avatar+PIN de ADR-004). Guardas por rol como función pura en `shared/servidor/guardas.ts` + compuerta de diagnósticos diarios (RF-63). |
| ¿Existe integración con Rekognition? ¿Dónde? ¿Guarda imágenes? | Sí: `src/modules/shared/servidor/proveedor-emociones.ts` (`DetectFacesCommand` con `Image.Bytes`, `Attributes: ["EMOTIONS"]`), seleccionable con `EMOTION_PROVIDER=simulado\|rekognition`. Endpoint `POST /api/alumno/emocion`. **No guarda imágenes**: buffer solo en memoria, persiste emoción+confianza en `RegistroEmocion`, sin logs. ⚠ La respuesta del endpoint devuelve la emoción detectada al cliente del alumno (riesgo RF-65, ver §8). Límite de frecuencia por alumno en memoria (8 s). |
| ¿Existe integración con OpenAI? | No. Los ejercicios se generan por reglas deterministas (`shared/dominio/ejercicios.ts`, RNG con semilla). |
| Pantallas existentes (lista) | **Ninguna página.** Solo `src/layouts/BaseLayout.astro` y `src/components/core/{Head,Header,Footer}.astro`. El middleware y el Header ya apuntan a `/login`, `/registro`, `/docente`, `/alumno`, `/alumno/diagnostico/{emocional,matematico}` y `/privacidad`, que no existen. |
| Endpoints existentes (lista) | `POST /api/auth/{login,logout,registro}`; alumno: `POST /api/alumno/{panas,diagnostico,emocion,alerta,practica}`, `POST /api/alumno/ejercicio/{siguiente\|responder\|guia}`; docente: `/api/docente/{grupos,alumnos,actividades,alertas,notas}`. Sin prefijo `/api/v1`; errores `{ok:false,error}` (no el formato de `convenciones.md §5`); JSON en `snake_case`. |
| Pruebas existentes y cobertura | Vitest 3, 4 archivos en `tests/unidad/` (guardas, racha, dificultad/frustración, ejercicios/diagnóstico/números/PANAS): **98 pruebas en verde**. Solo dominio puro; sin pruebas de API, BD, componentes ni E2E. Sin medición de cobertura. |
| CI existente | No. No hay `.github/`. El directorio **no es un repositorio git**. |
| Secretos en el repo (claves AWS/OpenAI en código) | **Ninguno encontrado** (búsqueda de `AKIA`, `sk-…`, `secretAccessKey`, contraseñas literales). No hay `.env`; `.gitignore` excluye `.env`. Las credenciales de AWS se toman de la cadena estándar del SDK. No hay historial git que revisar. |

**Estado de calidad (2026-10-27):** `npm test` ✔ (98/98). `astro check` ✘ con **9 errores, todos en `db/seed.ts`**: el seed importa tablas de un esquema anterior (`Nivel`, `Subtema`, `Opcion`, `Respuesta`, `Recomendacion`, `Progreso`, `Emocion`) que ya no existen en `db/config.ts`, así que `npm run dev` no puede sembrar la BD. Además hay 1 import sin usar en `docente/servidor/reportes.ts`.

**Nombre del producto:** el código y la UI usan «FEEL-FACE»; los specs usan «Numotion (MAES)».

Comandos sugeridos:
```bash
cat package.json */package.json 2>/dev/null | head -100
find . -path ./node_modules -prune -o -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.py" \) -print | head -200
grep -rIl "rekognition\|Rekognition" --exclude-dir=node_modules .
grep -rIl "openai" --exclude-dir=node_modules .
grep -rIn "AKIA\|sk-[A-Za-z0-9]\{20,\}" --exclude-dir=node_modules .   # secretos expuestos
```

## 3. Reglas de adaptación al código existente
1. **Si el stack difiere del ADR-008**, se conserva el existente. Se adaptan los specs de `02-diseno` (p. ej., Supabase → las políticas RLS de `03-seguridad` aplican tal cual; Expo/React Native → `06-navegacion` se implementa con Expo Router).
2. **Si existe una tabla/pantalla equivalente**, se mapea en la tabla de §4 en lugar de duplicarla.
3. **Si hay secretos en el código**, se detiene la refactorización, se reportan y se mueven a variables de entorno (prioridad máxima, RC-07).
4. **Si se guardan imágenes faciales**, es un incumplimiento de RNF-03/RC-05: se corrige en EXP-05 antes que cualquier otra funcionalidad nueva.

## 4. Mapeo código existente → specs (llenar tras inventario)

| Artefacto existente | Ruta | Destino en la refactorización | Acción (conservar / mover / reescribir / eliminar) |
|---|---|---|---|
| Módulos docente/alumno/shared | `src/modules/{docente,alumno,shared}/{dominio,servidor}` | Ya cumple ADR-001 (sin imports cruzados, verificado con grep). Falta el lint que lo bloquee (EXP-01.1). `shared` ≙ `core`. | Conservar; añadir regla de lint |
| Dominio puro (ejercicios, dificultad, frustración, PANAS, racha, gamificación, números, retroalimentación, motivación, fechas, RNG) | `src/modules/shared/dominio/*.ts` | Equivale a las funciones de `02-diseno/diseno/02-…` (decidirNivel, IF, racha). Contrastar las reglas exactas en cada Expect. | Conservar; ajustar a las tablas del spec (TDD) |
| Servicios del alumno (diagnóstico, motor de ejercicios, panel) | `src/modules/alumno/servidor/` | EXP-02, EXP-04, EXP-06 | Conservar |
| Servicios del docente (grupos, actividades, notas, reportes) | `src/modules/docente/servidor/` | EXP-03, EXP-07 | Conservar |
| Auth + sesiones | `src/modules/shared/servidor/auth.ts` | EXP-01. Docente OK (sesión opaca en lugar de JWT 15 min + refresh 7 d). Alumno: falta código de grupo + avatar + PIN (ADR-004). | Conservar y ampliar |
| Guardas + middleware | `src/modules/shared/servidor/guardas.ts`, `src/middleware.ts` | EXP-01.3, EXP-02.4 (P-ROUTE-01..03 como pruebas de la función pura) | Conservar |
| Consentimiento | Columnas `consentimiento_tutor`, `tutor_*`, `consentimiento_fecha` en `Alumno` | ADR-009 pide `consentimiento_tutor` versionado, revocable y con `acepta_camara` separado. | Reescribir como tabla |
| Proveedor emocional | `shared/servidor/proveedor-emociones.ts`, `pages/api/alumno/emocion.ts` | EXP-05.1/05.2 (`EmotionGateway`). Quitar la emoción de la respuesta al alumno (RF-65). El límite diario (RC-04) y el de frecuencia deben persistir fuera de memoria. | Conservar; corregir |
| Esquema de BD | `db/config.ts` | `02-diseno/diseno/01-modelo…` (faltan, p. ej., `ajuste_dificultad`, `auditoria_acceso`, `guia_actuacion`, `retroalimentacion`, `config_adaptativa`, `estado_derivado` en eventos emocionales). Depende de la decisión de §7. | Ampliar |
| Seed | `db/seed.ts` | Seed del esquema actual (temas, docente y alumnos demo) | **Reescribir** (roto) |
| API REST | `src/pages/api/**` | `05-contratos-de-api.md` (`/api/v1`, camelCase, error con `code`) | Conservar; alinear contratos gradualmente |
| Layout y componentes core | `src/layouts/`, `src/components/core/` | Base de UI (EXP-01.6) | Conservar |
| Pantallas | — | Todas las de `07-wireframes` | Crear |
| Pruebas unitarias | `tests/unidad/` | P-UNIT-* | Conservar; etiquetar con IDs P- |
| Imágenes demo | `public/images/*` | — | Conservar |
| README | `README.md` | Guía genérica de git/Astro | Actualizar al final |

## 5. Avance por Expect

| Expect | Estado | Notas |
|---|---|---|
| EXP-01 Base: auth, consentimiento, módulos | 🟨 En curso | ✅ Acceso docente y alumno (ADR-004) con pantallas, RLS, cabeceras de seguridad, consentimiento versionado en BD. ✅ Flujo del tutor con OTP, revocación y ARCO (T-03-01-10/15). Correo por Google Workspace (SMTP). Faltan: atención de solicitudes ARCO (rol admin), lint de límites, logger, rate-limit por IP |
| EXP-02 Diagnósticos PANAS-C y matemático | ✅ Hecho (pendiente validar contenido) | Backend y pantallas; P-E2E-01 y axe verdes en escritorio y tableta. Falta validar contenido: T-01-03, T-01-04, A-22 |
| EXP-03 Asignación y seguimiento | ✅ Hecho | Asistente de 3 pasos con previsualización, seguimiento con refresco y historial con filtros/cursor. Las asignaciones se completan cuando exista el motor (EXP-04) |
| EXP-04 Motor de ejercicios y adaptación | 🟨 En curso | Generador, intentos, guía y ajuste de nivel existen; faltan `ajuste_dificultad`, UI, cola offline y OpenAI |
| EXP-05 Detección emocional y alertas | 🟨 En curso | Rekognition sin persistencia ✔; faltan IF según spec, SSE, guías de actuación y límite diario |
| EXP-06 Gamificación | 🟨 En curso | Puntos, racha, insignias y frases en dominio; falta UI |
| EXP-07 Dashboard docente, perfil y reportes | 🟨 En curso | Reportes y notas en servicio; faltan UI, CSV y auditoría de fichas |

Leyenda: ⬜ Pendiente · 🟨 En curso · ✅ Hecho · ⛔ Bloqueado

## 6. Pendientes de validación con stakeholders
Ver `01-analisis/requerimientos.md §3` (ambigüedades A-01 a A-16). Mientras no se validen, el agente aplica la **interpretación adoptada** de esa tabla.

## 7. Propuesta T-00-03 (ADR-008) — resuelta en ADR-010 (2026-10-27): PostgreSQL (opción b), Vercel, acceso del alumno según ADR-004

Regla §3.1: si el stack difiere, se conserva el existente. Se propone aceptar ADR-008 ajustado así:

| Capa | ADR-008 propuesto | Real / propuesta |
|---|---|---|
| Frontend | React 18 + Vite SPA + React Router | Astro 5 SSR + islas React 19 + Tailwind 4 (rutas por archivo de Astro; guardas en middleware) |
| Backend | Express + Zod + Prisma | Endpoints de Astro + `astro/zod` |
| BD | PostgreSQL 16 + RLS | **Por decidir**: (a) seguir con Astro DB/libSQL, sin RLS: autorización solo en la capa de servicio, con pruebas P-SEC por endpoint; (b) migrar a PostgreSQL (Drizzle) para cumplir ADR-003 |
| Infra | AWS (S3/CloudFront, App Runner, RDS) | Vercel (adaptador actual); RC-02 pide AWS: por decidir |
| Pruebas | Vitest, RTL, Supertest, Playwright, pgTAP, k6 | Vitest (existente) + Playwright + k6; pgTAP solo si se elige PostgreSQL |

ADR aceptados que entran en conflicto con el código y requieren decisión: **ADR-003** (libSQL no tiene RLS), **ADR-004** (el alumno entra hoy con contraseña) y **ADR-009** (consentimiento como booleano).

## 8. Hallazgos a corregir (priorizados)
1. `db/seed.ts` está roto contra el esquema actual (bloquea `astro check` y `npm run dev`).
2. `POST /api/alumno/emocion` devuelve la emoción detectada al alumno (GUIA §3 regla 5, RF-65).
3. El bloqueo de login y los límites de Rekognition viven en la memoria del proceso: no funcionan en serverless (RC-04, seguridad).
4. No hay control de versiones (git) ni CI.

## 9. Migración a PostgreSQL (ADR-010)

| Pieza | Estado | Ubicación |
|---|---|---|
| PostgreSQL local | ✅ `docker compose up -d` (puerto 5433) | `docker-compose.yml`, `.env.example` |
| Migraciones 0001 esquema, 0002 funciones/triggers + auth, 0004 RLS | ✅ Aplican en BD vacía | `db/migrations/`, `npm run db:migrar` |
| 0003 vistas (T-02-05) y 0005 seed de catálogos (T-02-07) | ⬜ | — |
| Pruebas de BD: P-DB-01…08, RLS, auth | ✅ 28 en verde (`npm run test:db`) | `tests/db/` |
| `conContexto` (contexto RLS por transacción) | ✅ | `src/modules/shared/servidor/db.ts` |
| Dominio del acceso del alumno (íconos PIN, avatares, código) | ✅ con pruebas | `src/modules/shared/dominio/acceso.ts` |
| Auth, middleware y endpoints sobre PostgreSQL (T-03-01-04…07) | ✅ Probado de punta a punta con `npm run dev` | `src/modules/shared/servidor/auth.ts`, `src/middleware.ts`, `src/pages/api/v1/auth/` |
| Grupos y alta de alumnos del docente | ✅ | `src/modules/docente/servidor/grupos.ts`, `src/pages/api/v1/docente/grupos/` |
| Seed de demostración | ✅ `npm run db:seed` | `db/seed/0001_demo.sql` |
| Servicios docente/alumno sobre PostgreSQL y retiro de `astro:db` (T-03-01-01) | 🟨 `@astrojs/db` retirado; diagnósticos, actividades, motor, emociones, gamificación y reportes siguen en `legacy/` por migrar | `legacy/` |

La app ya corre sobre PostgreSQL. Diagnósticos migrados (EXP-02, `0005_catalogos`, `0006_diagnostico_respuesta`); tras completarlos el alumno pasa la compuerta, pero panel y actividades siguen en `legacy/`.

## 10. Pruebas disponibles

| Comando | Qué corre | Requisitos |
|---|---|---|
| `npm test` | Unitarias + componentes (Testing Library/jsdom) | — |
| `npm run test:db` | P-DB, RLS, auth y diagnósticos contra PostgreSQL | `docker compose up -d` |
| `npm run test:e2e` | P-E2E-01/02 + axe (P-A11Y-01) en escritorio y tableta; capturas en `test-results/capturas/` | Docker + `npm run db:migrar`; Playwright ≥ 1.63 (la 1.52 se cuelga con Node 24) |
