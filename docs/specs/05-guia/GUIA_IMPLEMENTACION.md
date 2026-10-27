# Guía de implementación para agentes

Cómo usar estos specs para que un agente de código (Claude Code u otro) implemente la refactorización de `teds_project-main` de forma ordenada y verificable.

## 1. Orden de lectura (contexto mínimo por sesión)

Siempre:
1. `docs/SDD_Numotion.md`
2. `docs/specs/00-contexto/convenciones.md`
3. `docs/specs/00-contexto/estado-actual.md`
4. `docs/specs/00-contexto/adr.md`

Luego, **solo** lo de la tarea en curso:
| Si la tarea es de… | Leer además |
|---|---|
| BD / migraciones | `02-diseno/diseno/01-modelo…`, `02-funciones…`, `03-seguridad…` |
| API | `02-diseno/diseno/05-contratos-de-api.md` + el Expect correspondiente |
| Web | `04-arquitectura-frontend.md`, `06-navegacion…`, `07-wireframes…` + Expect |
| Pruebas | `04-pruebas/diseno/01-piramide-y-matriz…` + el archivo del tipo de prueba |

## 2. Ciclo de trabajo por tarea

```
1. Elegir la siguiente tarea no bloqueada de ruta-de-ejecucion.md
2. Leer su Expect y las pruebas asociadas (matriz de pruebas)
3. Escribir/ajustar primero las pruebas (rojo)
4. Implementar lo mínimo para pasar (verde)
5. pnpm lint && pnpm typecheck && pnpm test (+ db/api si aplica)
6. Marcar [x] en tareas.md y actualizar estado-actual.md §5
7. Commit: feat(<modulo>): <qué> [T-xx-yy-zz][RF-nn]
```

## 3. Reglas que el agente no debe romper
1. **Nunca** persistir imágenes faciales ni registrar el body de `/emociones/frame` (RNF-03, RC-05).
2. **Nunca** importar entre `modules/docente` y `modules/alumno` (ADR-001).
3. **Nunca** desactivar RLS ni conectar la app con un rol `BYPASSRLS` (ADR-003).
4. **Nunca** enviar nombre, grupo, estado emocional ni identificadores del alumno a OpenAI (ADR-007).
5. **Nunca** mostrar al alumno datos emocionales, AP/AN, ni comparaciones con otros alumnos (RF-65, RF-66).
6. **Nunca** commitear secretos; si se encuentran en el código existente, detener y aplicar T-00-02.
7. Ante una ambigüedad nueva: aplicar la interpretación más conservadora con la privacidad, registrarla como `A-xx` en `01-analisis/requerimientos.md §3` y seguir.
8. No cambiar IDs de requerimientos, tareas ni pruebas; solo agregar.

## 4. Prompts plantilla

### 4.1 Arranque (una vez)
```
Lee docs/SDD_Numotion.md y docs/specs/00-contexto/*. Ejecuta T-00-01: inventaria el
repositorio y llena las tablas §2 y §4 de estado-actual.md. No modifiques código.
Al terminar, propón si ADR-008 se acepta o se ajusta al stack real (T-00-03) y lista
los secretos encontrados (T-00-02), si los hay.
```

### 4.2 Tarea de implementación
```
Contexto: docs/SDD_Numotion.md, docs/specs/00-contexto/{convenciones,estado-actual}.md,
docs/specs/03-desarrollo/diseno/<EXP>.md y los archivos de 02-diseno que cite.
Tarea: <T-03-xx-yy> — <descripción>.
Pruebas a cumplir: <P-…> (ver docs/specs/04-pruebas/diseno/01-piramide-y-matriz-de-pruebas.md).
Hazlo con TDD, respeta las reglas de GUIA_IMPLEMENTACION.md §3, corre lint/typecheck/test,
marca la tarea en tareas.md y actualiza estado-actual.md. Resume qué cambiaste y cualquier
desviación del spec.
```

### 4.3 Revisión por un segundo agente (sin contexto del implementador)
```
Revisa el diff de la rama <rama> contra docs/specs/03-desarrollo/diseno/<EXP>.md.
Verifica: (1) cada expectativa EXP-xx.n afectada se cumple, (2) las pruebas listadas existen
y prueban lo que dicen, (3) no se rompe ninguna regla de GUIA_IMPLEMENTACION.md §3,
(4) no hay imports cruzados docente/alumno. Reporta hallazgos con archivo y línea.
```

### 4.4 Paralelización
Tareas paralelizables sin conflicto (archivos disjuntos) se marcan con 🔀 en `ruta-de-ejecucion.md`. Usar una rama/worktree por agente; integrar en el orden de la ruta.

## 5. Variables de entorno

| Variable | Ejemplo | Uso |
|---|---|---|
| `DATABASE_URL` | `postgres://numotion_app:…@…/numotion` | API |
| `DATABASE_OWNER_URL` | `postgres://numotion_owner:…` | Solo migraciones |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | PEM | Auth |
| `AWS_REGION` | `us-east-1` | Rekognition (credenciales por rol IAM) |
| `REKOGNITION_MODE` | `live` \| `mock` | Pruebas |
| `REKOGNITION_SAMPLE_SECONDS` | `10` | Muestreo (cliente lo recibe en login) |
| `REKOGNITION_DAILY_CAP_PER_ALUMNO` | `400` | RC-04 |
| `OPENAI_ENABLED` | `false` | RI-07 (Should) |
| `OPENAI_API_KEY` | secreto | — |
| `OPENAI_MODEL` | por definir según disponibilidad y costo | — |
| `OPENAI_MONTHLY_BUDGET_USD` | `20` | RC-04 |
| `OPENAI_MODE` | `live` \| `mock` | Pruebas |
| `APP_TIMEZONE` | `America/Tijuana` | Días hábiles, sesión diaria |
| `WEB_ORIGIN` | `https://app.numotion.mx` | CORS, CSP |
| `MAIL_FROM` | `no-responder@numotion.mx` | Consentimiento |

## 6. Definición de terminado del MVP
- Todos los Expects ✅ en `estado-actual.md`.
- Criterios de salida de `04-pruebas/requerimientos.md` cumplidos.
- Matriz de trazabilidad sin huecos.
- Plan de negocios corregido (A-11) y aviso de privacidad aprobado.
