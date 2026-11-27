# Estado actual

> **Importante para el agente:** estas especificaciones se escribieron **a partir de la matriz de requerimientos y el plan de negocios, sin revisar el código de `teds_project-main`.** La primera tarea de cualquier agente es **T-00-01: inventario del repositorio** (abajo) y actualizar este archivo antes de tocar código.

## 1. Estado del proyecto

| Aspecto | Estado |
|---|---|
| Requerimientos | Matriz de clasificación actualizada el 2026-11-26 (39 RF, 6 RNF, 7 RI, 7 RC); ver §5.1 |
| SDD y specs | v1.0 — este documento |
| Código | Inventariado (T-00-01, 2026-10-27). Backend de dominio y API avanzados; **sin pantallas** |
| Stack | **ADR-011**: SPA React + Vite + React Router (`apps/web`), API Express (`apps/api`), dominio compartido (`packages/core`), PostgreSQL 16 con RLS vía Prisma 6 (ADR-012), Vercel |
| Despliegue | Vercel; AWS (RC-02) por definir: requiere cuenta, IaC y presupuesto |

## 2. T-00-01 · Inventario del repositorio (obligatorio primero)

El agente debe llenar esta tabla inspeccionando el repositorio:

| Pregunta | Respuesta |
|---|---|
| Lenguajes y framework del frontend | TypeScript 5 (strict, `astro/tsconfigs/strict`). **Astro 5** con `output: "server"` + `@astrojs/react` (React 19) + Tailwind CSS 4 (`@tailwindcss/vite`). No es SPA: no hay React Router, TanStack Query ni Zustand. |
| Framework del backend (o BaaS: Supabase/Firebase) | Endpoints de Astro (`src/pages/api/**`) + `src/middleware.ts`. Validación con `astro/zod`. Adaptador `@astrojs/vercel` (despliegue en Vercel, no AWS). Sin Express. |
| Base de datos y ORM / migraciones existentes | **Astro DB** (libSQL/SQLite, Drizzle por debajo). Esquema en `db/config.ts` con 15 tablas: Usuario, Sesion, Grupo, Alumno, Tema, DiagnosticoPanas, DiagnosticoMatematico, Actividad, AsignacionAlumno, SesionPractica, Intento, RegistroEmocion, Alerta, Nota, InsigniaAlumno. Sin migraciones SQL versionadas (Astro DB usa `db push`). Sin PostgreSQL ni RLS. |
| ¿Existe autenticación? ¿Qué proveedor? | Propia: usuario/contraseña con scrypt + sesión opaca en cookie `ff_sesion` (httpOnly, 8 h; en BD solo el hash SHA-256). Bloqueo de 5 fallos/15 min **en memoria** (no sobrevive entre instancias serverless). El alumno entra con usuario+contraseña creados por el docente (**no** código+avatar+PIN de ADR-004). Guardas por rol como función pura en `shared/servidor/guardas.ts` + compuerta de diagnósticos diarios (RF-63). |
| ¿Existe integración con Rekognition? ¿Dónde? ¿Guarda imágenes? | Sí: `src/modules/shared/servidor/proveedor-emociones.ts` (hoy en `legacy/`, se migra con EXP-05) (`DetectFacesCommand` con `Image.Bytes`, `Attributes: ["EMOTIONS"]`), seleccionable con `EMOTION_PROVIDER=simulado\|rekognition`. Endpoint `POST /api/alumno/emocion`. **No guarda imágenes**: buffer solo en memoria, persiste emoción+confianza en `RegistroEmocion`, sin logs. ⚠ La respuesta del endpoint devuelve la emoción detectada al cliente del alumno (riesgo RF-65, ver §8). Límite de frecuencia por alumno en memoria (8 s). |
| ¿Existe integración con OpenAI? | Sí, opcional (`OPENAI_ENABLED`). OpenAI solo redacta la historia; números, respuesta, opciones y pasos siguen saliendo del generador determinista. Caché en `ejercicio` (origen `openai`), presupuesto mensual en `uso_openai`, respaldo de catálogo ante cualquier fallo. |
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
| Dominio puro (ejercicios, dificultad, frustración, PANAS, racha, gamificación, números, retroalimentación, motivación, fechas, RNG) | `packages/core/src/dominio/*.ts` | Equivale a las funciones de `02-diseno/diseno/02-…` (decidirNivel, IF, racha). Contrastar las reglas exactas en cada Expect. | Conservar; ajustar a las tablas del spec (TDD) |
| Servicios del alumno (diagnóstico, motor de ejercicios, panel) | `apps/api/src/modules/alumno/` | EXP-02, EXP-04, EXP-06 | Conservar |
| Servicios del docente (grupos, actividades, notas, reportes) | `apps/api/src/modules/docente/` | EXP-03, EXP-07 | Conservar |
| Auth + sesiones | `apps/api/src/modules/core/auth.ts` | EXP-01. Docente OK (sesión opaca en lugar de JWT 15 min + refresh 7 d). Alumno: falta código de grupo + avatar + PIN (ADR-004). | Conservar y ampliar |
| Guardas + middleware | `packages/core/src/guardas.ts`, `apps/api/src/app.ts` | EXP-01.3, EXP-02.4 (P-ROUTE-01..03 como pruebas de la función pura) | Conservar |
| Consentimiento | Columnas `consentimiento_tutor`, `tutor_*`, `consentimiento_fecha` en `Alumno` | ADR-009 pide `consentimiento_tutor` versionado, revocable y con `acepta_camara` separado. | Reescribir como tabla |
| Proveedor emocional | `shared/servidor/proveedor-emociones.ts`, `pages/api/alumno/emocion.ts` | EXP-05 Detección emocional y alertas | ✅ Hecho (pendiente validar guías) | `EmotionGateway` (Rekognition/simulado, timeout 3 s, buffer a ceros, sin imágenes en BD ni logs), `POST /alumno/emociones/frame` con topes por alumno en BD (`uso_rekognition`, 0012), IF en cada fotograma e intento, alerta a la 2.ª evaluación alta con enfriamiento, SSE `/docente/alertas/stream` (sondeo de BD, multi-instancia), guía de actuación, "¿Quieres que te ayude?" → R2, captura de cámara con indicador y consentimiento, `npm run db:purgar`. Contenido de guías provisional (T-01-05) |
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
| EXP-01 Base: auth, consentimiento, módulos | 🟨 En curso | ✅ Acceso docente y alumno (ADR-004) con pantallas, RLS, cabeceras de seguridad, consentimiento versionado en BD. ✅ Flujo del tutor con OTP, revocación y ARCO (T-03-01-10/15). Correo por Google Workspace (SMTP). ✅ Rol administrador (migración 0013, `npm run admin:crear`, `/admin`) que atiende ARCO y revocaciones en ≤ 20 días hábiles, responde al tutor por correo y anonimiza con `fn_anonimizar_alumno`; todo auditado. ✅ RC-03: el área del alumno exige un dispositivo con cámara y, con la cámara autorizada, la actividad no sigue sin ella. Faltan: lint de límites, logger, rate-limit por IP |
| EXP-02 Diagnósticos PANAS-C y matemático | ✅ Hecho (pendiente validar contenido) | Backend y pantallas; P-E2E-01 y axe verdes en escritorio y tableta. Falta validar contenido: T-01-03, T-01-04, A-22 |
| EXP-03 Asignación y seguimiento | ✅ Hecho | Asistente de 3 pasos con previsualización, seguimiento con refresco y historial con filtros/cursor. Las asignaciones se completan cuando exista el motor (EXP-04) |
| EXP-04 Motor de ejercicios y adaptación | ✅ Entrega 2 de 2 | ✅ Motor completo (nivel, puntos, guía, idempotencia, ajuste_dificultad; máximo 3 intentos por ejercicio, RF-11) + Mis actividades + los 7 tipos del catálogo (selección, encuentra el número, completar operación, arrastrar, con letras en serie de 3 números (RF-39), suma con figuras, colorear) + contenido provisional de geometría y fracciones (A-30) + cola sin conexión con IndexedDB (EXP-04.9, P-E2E-05, A-32). Problemas con historia de OpenAI (T-03-04-20) y precarga + code splitting de la pantalla de actividad (T-03-04-21) |
| EXP-05 Detección emocional y alertas | 🟨 En curso | Rekognition sin persistencia ✔, IF, SSE, límite diario. Guía de actuación solo para desinterés (A-34). La alerta en < 2 s de RF-16 queda fuera de esta versión (A-38) |
| EXP-06 Gamificación | ✅ Hecho | Panel (personaje + accesorios por nivel, mensaje del día sin repetir, racha L–V y mejor racha), perfil sin datos emocionales, insignias del catálogo (0011) evaluadas tras cada ejercicio cerrado/práctica, práctica libre de 5 ejercicios que dispara la racha (temas con dominio ≤ 2 primero, con etiqueta "Recomendado", RF-03), mensaje del día con historial académico (RF-22), celebraciones de insignia y nivel |
| EXP-07 Dashboard docente, perfil y reportes | ✅ Hecho | Resumen previo por grupo (distribución, AP/AN, dominio, "sin datos hoy"), alertas en vivo, ficha auditada (resumen, perfil estadístico, cruce diagnóstico matemático × PANAS-C por tema (RF-52), resultados con captura y consolidado, notas rápidas), pantalla Retroalimentaciones (registros por alumno y fecha y detalle del diagnóstico matemático por tema con el PANAS-C del día; reemplaza el detalle por alumno del Dashboard), reporte por tema/habilidad (ejercicios, aciertos, errores e índice de error, ordenado por índice; filtro por grupo, alumno y fecha, sin exportación; RF-18). Las habilidades usan tipo de ejercicio + nivel mientras no haya subtemas en el catálogo |

Leyenda: ⬜ Pendiente · 🟨 En curso · ✅ Hecho · ⛔ Bloqueado

### 5.1 Ajustes a la matriz actualizada (2026-11-26)

Se revisó el código contra `requerimientos_act.pdf`. Detalle e interpretaciones en `01-analisis/requerimientos.md` (A-33 a A-40). Migración `0014_ajustes_requerimientos.sql`.

| RF | Cambio aplicado |
|---|---|
| RF-11 | Actividades asignadas con **3 intentos** (antes 4). El 3.er fallo cierra el ejercicio con la guía y la respuesta (RF-45). Trigger `fn_intento_actualiza_asignacion` y `MAX_INTENTOS` en `apps/api/src/modules/alumno/ejercicio.ts` |
| RF-72 | "En curso" al completarse el primer ejercicio, no con el primer intento |
| RF-52 | `cruce()` relaciona por tema el dominio del diagnóstico matemático con el AP/AN del PANAS-C de la misma sesión; ya no usa resultados consolidados ni la cámara |
| RF-39 | Serie de 3 números con un campo por número; respuesta como arreglo JSON (`evaluarEscritura` en `numeros.ts`) |
| RF-03 | Práctica libre: temas con dominio ≤ 2 primero y con "Recomendado"; todos los juegos siguen disponibles. Puntos por cada respuesta correcta (3, 2 o 1 según el intento, `puntosAciertoPractica`), en lugar de 5 fijos al terminar |
| RF-22 | Mensaje del día con historial académico (actividades, último resultado y tema, temas fuerte y por reforzar); 6 mensajes nuevos |
| RF-27 | Solo queda la guía de desinterés; las alertas de frustración van sin guía |
| RF-18 | Reporte solo con índice de error; se retiraron los aspectos emocionales |
| RF-16, RF-56 | Sin cambios por decisión del equipo (A-38, A-05) |

Retirados de la matriz: RF-35 y RF-44 (su funcionalidad se conserva en la app).

### Pendientes fuera del código (2026-11-06)
- **RC-02** despliegue en AWS (T-03-01-18): requiere cuenta, credenciales y decisión de infraestructura.
- **RNF-01/RNF-02** medición de latencia con k6 (P-PERF) y **RNF-06** prueba de usabilidad con 10 alumnos.
- **RNF-10/RC-07/RC-08** revisión legal del aviso de privacidad y del flujo de consentimiento (la atención ARCO por un administrador ya está en la app). Cifrado en reposo: depende de la base gestionada (RDS/KMS, RC-02).
- **RC-03**: hecho en la app (guarda `RequireCamara` + bloqueo en la actividad). La detección es del navegador: un dispositivo sin cámara no puede comprobarse desde el servidor.

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
| `conContexto` (contexto RLS por transacción) | ✅ | `apps/api/src/infra/db.ts` |
| Dominio del acceso del alumno (íconos PIN, avatares, código) | ✅ con pruebas | `packages/core/src/dominio/acceso.ts` |
| Auth, middleware y endpoints sobre PostgreSQL (T-03-01-04…07) | ✅ Probado de punta a punta con `npm run dev` | `apps/api/src/modules/core/auth.ts`, `apps/api/src/app.ts`, `apps/api/src/modules/*/rutas.ts` |
| Grupos y alta de alumnos del docente | ✅ | `apps/api/src/modules/docente/grupos.ts`, `apps/api/src/modules/*/rutas.ts` |
| Seed de demostración | ✅ `npm run db:seed` | `db/seed/0001_demo.sql` |
| Servicios docente/alumno sobre PostgreSQL y retiro de `astro:db` (T-03-01-01) | 🟨 `@astrojs/db` retirado; diagnósticos, actividades, motor, emociones, gamificación y reportes siguen en `legacy/` por migrar | `legacy/` |

La app ya corre sobre PostgreSQL. Diagnósticos migrados (EXP-02, `0005_catalogos`, `0006_diagnostico_respuesta`); tras completarlos el alumno pasa la compuerta, pero panel y actividades siguen en `legacy/`.

## 10. Pruebas disponibles

| Comando | Qué corre | Requisitos |
|---|---|---|
| `npm test` | Unitarias + componentes (Testing Library/jsdom) | — |
| `npm run test:db` | P-DB, RLS y servicios + capa Express con Supertest (`tests/api`) contra PostgreSQL | `docker compose up -d` |
| `npm run test:e2e` | P-E2E + axe (P-A11Y-01) en escritorio y tableta contra el SPA (:5173) y la API (:3000), que arranca solo; capturas en `test-results/capturas/` | Docker + `npm run db:migrar`; Playwright ≥ 1.63 (la 1.52 se cuelga con Node 24) |
