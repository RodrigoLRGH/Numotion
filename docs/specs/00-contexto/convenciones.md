# Convenciones del proyecto

## 1. Idioma
- **Dominio en español** (tablas, entidades, rutas de API, nombres de componentes de negocio): `asignacion_alumno`, `/docente/actividades`, `PanelAlumno`.
- **Código técnico en inglés** cuando es infraestructura genérica: `useAuth`, `httpClient`, `errorHandler`.
- Documentación, commits y PR en español.

## 2. Identificadores de trazabilidad
| Prefijo | Significado | Ejemplo |
|---|---|---|
| RF / RNF / RI / RC | Requerimientos (de la matriz, no se renumeran) | RF-57 |
| CU | Caso de uso | CU-04 |
| HU | Historia de usuario | HU-12 |
| EXP | Expect (expectativa de desarrollo) | EXP-04.3 |
| T | Tarea atómica: `T-<fase>-<expect>-<n>` | T-03-04-07 |
| P | Prueba: `P-<tipo>-<n>` | P-UNIT-12, P-DB-03 |
| ADR | Decisión de arquitectura | ADR-002 |

Todo commit/PR referencia al menos un `T-` y su `RF-`: `feat(alumno): registrar intento con tiempo [T-03-04-05][RF-47]`.

## 3. Estructura de carpetas (código)

```
teds_project-main/
├─ apps/
│  ├─ web/                      # SPA
│  │  └─ src/
│  │     ├─ app/                # router, providers, layout raíz
│  │     ├─ modules/
│  │     │  ├─ docente/         # pages/, components/, hooks/, api/
│  │     │  └─ alumno/          # pages/, components/, hooks/, api/, ejercicios/
│  │     └─ shared/             # ui/, api/, auth/, camera/, lib/, types/
│  └─ api/
│     └─ src/
│        ├─ modules/
│        │  ├─ docente/         # routes, controllers, services
│        │  ├─ alumno/
│        │  └─ core/            # auth, adaptive, emotion, content, gamificacion, audit
│        ├─ infra/              # db (prisma), aws, openai, logger, config
│        └─ server.ts
├─ packages/
│  └─ contracts/                # esquemas Zod + tipos compartidos web/api
├─ db/
│  ├─ migrations/               # 0001_esquema.sql, 0002_funciones_triggers.sql, ...
│  └─ tests/                    # pgTAP
├─ tests/e2e/                   # Playwright
├─ perf/                        # k6
└─ docs/                        # este SDD y specs
```

Regla de dependencias (ADR-001), verificada con `eslint-plugin-boundaries`:
- `modules/docente` → `shared`/`core`, `packages/contracts` ✔
- `modules/alumno` → `shared`/`core`, `packages/contracts` ✔
- `modules/docente` ↔ `modules/alumno` ✘

## 4. Nomenclatura
| Elemento | Convención | Ejemplo |
|---|---|---|
| Tablas/columnas | `snake_case` singular | `intento_ejercicio.tiempo_ms` |
| Enums BD | `snake_case` | `estado_asignacion` |
| Componentes React | `PascalCase` | `TarjetaActividad.tsx` |
| Hooks | `useCamelCase` | `useEmotionCapture.ts` |
| Rutas API | kebab/español, plural | `/api/v1/docente/notas-alumno` |
| Variables de entorno | `UPPER_SNAKE` | `REKOGNITION_SAMPLE_SECONDS` |
| Archivos de prueba | `*.test.ts(x)`, `*.e2e.ts`, `*.sql` (pgTAP) | |

## 5. API
- Prefijo `/api/v1`. JSON `camelCase` en el cable; Prisma mapea a `snake_case`.
- Validación de entrada y salida con Zod (`packages/contracts`).
- Errores: `{ "error": { "code": "ASIGNACION_DESTINO_INVALIDO", "message": "...", "details": {} } }` con códigos HTTP estándar.
- Fechas ISO-8601 UTC; la UI muestra en `America/Tijuana` u hora local del navegador.
- Paginación por cursor: `?limit=20&cursor=...` → `{ items, nextCursor }`.

## 6. Git
- Ramas: `main` (protegida), `feat/<T-id>-<slug>`, `fix/...`, `docs/...`.
- Conventional Commits. PR requiere CI verde y 1 revisión.
- Cada PR actualiza `docs/specs/00-contexto/estado-actual.md` si cambia el estado de una tarea.

## 7. Definition of Done (por tarea)
1. Código con tipos estrictos (`strict: true`), sin `any` implícito.
2. Pruebas de la tarea escritas y en verde (ver matriz de pruebas).
3. Lint + typecheck + build sin errores.
4. Contrato de API actualizado si cambió.
5. Sin datos personales en logs; sin imágenes persistidas.
6. Checkbox de la tarea marcado en `tareas.md`.

## 8. Accesibilidad y UI infantil (RI-01, RNF-06)
- WCAG 2.1 AA: contraste ≥ 4.5:1, foco visible, objetivos táctiles ≥ 48×48 px (alumno), navegación por teclado.
- Instrucciones del alumno: texto corto + ícono + botón de audio (Web Speech API `speechSynthesis`, `es-MX`).
- Nunca rankings ni comparaciones entre alumnos (RF-66).
- Mensajes de error al alumno en tono positivo ("¡Casi! Intenta otra vez").
