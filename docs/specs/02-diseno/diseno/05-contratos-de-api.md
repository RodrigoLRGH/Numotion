# Contratos de API — `/api/v1`

Esquemas Zod en `packages/contracts` (fuente única). JSON `camelCase`. Errores: `{ error: { code, message, details? } }`. Todas las rutas requieren HTTPS. Se publicará `openapi.yaml` generado desde Zod (`zod-to-openapi`) en `docs/specs/02-diseno/openapi.yaml` (T-02-10).

## 0. Códigos de error comunes
| HTTP | code | Cuándo |
|---|---|---|
| 400 | `VALIDACION` | Cuerpo/query inválido (details = issues de Zod) |
| 401 | `NO_AUTENTICADO` | Token ausente/expirado |
| 403 | `CONSENTIMIENTO_REQUERIDO` | Alumno sin consentimiento vigente |
| 403 | `DIAGNOSTICOS_PENDIENTES` | Alumno intenta panel/actividades sin RF-54/55 del día |
| 404 | `NO_ENCONTRADO` | Recurso inexistente **o ajeno** |
| 409 | `ASIGNACION_COMPLETADA` | Intento sobre asignación cerrada |
| 422 | `ASIGNACION_DESTINO_INVALIDO` | grupo y alumnos a la vez, o ninguno |
| 423 | `CUENTA_BLOQUEADA` | Demasiados intentos de acceso |
| 429 | `LIMITE_EXCEDIDO` | Rate limit / tope de frames |

---

## 1. Autenticación
### `POST /auth/docente/login`
```json
// req
{ "email": "maestra@escuela.mx", "password": "********" }
// 200
{ "accessToken": "jwt", "docente": { "id": "uuid", "nombre": "Laura Pérez" } }   // + cookie refresh
```
### `POST /auth/docente/refresh` · `POST /auth/logout`
### `GET /auth/alumno/grupo/:codigo` → avatares del grupo (sin nombres completos)
```json
{ "grupoId": "uuid", "alumnos": [{ "id": "uuid", "avatar": "zorro", "nombreCorto": "Ana" }], "iconosPin": ["sol","luna", "..."] }
```
### `POST /auth/alumno/login`
```json
// req
{ "grupoId": "uuid", "alumnoId": "uuid", "pin": ["sol","pez","sol","arbol"] }
// 200
{ "accessToken": "jwt", "alumno": { "id": "uuid", "nombre": "Ana", "avatar": "zorro" },
  "sesion": { "id": "uuid", "fecha": "2026-10-26", "panasCompleto": false, "diagnosticoCompleto": false },
  "camaraPermitida": true }
```

## 2. Consentimiento (público, por token)
| Método y ruta | Descripción |
|---|---|
| `GET /consentimiento/:token` | Aviso vigente + datos mínimos del alumno |
| `POST /consentimiento/:token/otp` | Envía OTP al correo del tutor |
| `POST /consentimiento/:token` | `{ tutorNombre, parentesco, otp, aceptaPlataforma: true, aceptaCamara: boolean }` → 201 |
| `POST /consentimiento/:token/revocar` | `{ otp }` → 200, invalida sesiones |
| `POST /consentimiento/:token/arco` | `{ otp, tipo: 'acceso'|'rectificacion'|'cancelacion'|'oposicion', detalle }` → 202 |

---

## 3. Módulo Alumno (`role=alumno`, `requireConsent`)

### 3.1 Diagnósticos (RF-54, RF-55, RF-61)
| Método y ruta | Req | Res |
|---|---|---|
| `GET /alumno/diagnostico/panas` | — | `{ items: [{ id, orden, texto, audioUrl }], escala: [{valor:1, icono:"😞", etiqueta:"Nada"}, …5] , respondidos: [itemId] }` |
| `PUT /alumno/diagnostico/panas/respuestas/:itemId` | `{ valor: 1..5 }` | 204 (guardado incremental, CU-02 A1) |
| `POST /alumno/diagnostico/panas/finalizar` | — | `{ afectoPositivo: 3.8, afectoNegativo: 1.6 }` · 422 si faltan ítems |
| `GET /alumno/diagnostico/matematico/siguiente` | — | `{ pregunta: PreguntaPublica, temaId, progreso: { actual: 4, total: 15 } }` o `{ terminado: true }` |
| `POST /alumno/diagnostico/matematico/respuestas` | `{ preguntaId, respuesta, tiempoMs }` | `{ correcta: boolean }` (sin revelar respuesta) |
| `POST /alumno/diagnostico/matematico/finalizar` | — | `{ dominio: { [temaId]: 1..5 }, retroalimentacionId }` → genera RF-61 |

### 3.2 Panel (RF-63, RF-64, RF-65, RF-66, RF-22)
`GET /alumno/panel` → 403 `DIAGNOSTICOS_PENDIENTES` si aplica.
```json
{
  "mensajeMotivacional": "¡Hola Ana! Llevas 3 días seguidos, ¡sigue así!",
  "racha": { "actual": 3, "mejor": 7 },
  "insignias": [{ "clave": "racha_5", "nombre": "5 días seguidos", "icono": "🔥", "obtenidaEn": "..." }],
  "gamificacion": { "puntos": 340, "nivel": 3, "puntosSiguienteNivel": 600, "personaje": "zorro" },
  "actividades": { "pendientes": 2, "enCurso": 1 }
}
```
`GET /alumno/actividades?estado=pendiente,en_curso,completada`
```json
{ "items": [{ "asignacionId": "uuid", "nombre": "Sumas 1", "tema": "Suma",
  "tipoInteraccion": "seleccion_multiple", "fechaAsignacion": "2026-10-26",
  "estado": "en_curso", "progreso": { "resueltos": 4, "total": 10 } }] }
```
`GET /alumno/perfil` → `{ nombre, grado, grupo, nivelGamificacion, puntos, personaje, insignias[] }` (sin datos emocionales).

### 3.3 Resolver actividad (RF-60, RF-47, RF-01, RF-21, RF-11, RF-45)
`POST /alumno/actividades/:asignacionId/iniciar` → `{ nivelActual, ejercicio: EjercicioPublico }`
`GET /alumno/actividades/:asignacionId/siguiente` → `{ ejercicio: EjercicioPublico, nivel } | { completada: true, resultado }`

`EjercicioPublico`:
```json
{ "id": "uuid", "tipoInteraccion": "completar_operacion", "nivel": 2,
  "enunciado": { "operacion": "suma", "a": 7, "b": null, "resultado": 12 },
  "opciones": [3, 5, 6, 8], "hashRespuesta": "sha256…", "audioInstruccion": "Elige el número que falta" }
```

`POST /alumno/intentos`
```json
// req
{ "clienteId": "uuid-v4", "asignacionId": "uuid", "ejercicioId": "uuid",
  "respuesta": { "valor": 5 }, "numeroIntento": 1, "tiempoMs": 8420, "ayudaSolicitada": false }
// 201
{ "correcta": true, "puntos": 10, "ejercicioCerrado": true,
  "nivel": { "anterior": 2, "actual": 3, "motivo": "desempeno" },
  "guia": null,
  "asignacion": { "estado": "en_curso", "resueltos": 5, "total": 10 },
  "recompensa": null }
// 201 fallo en intento 3
{ "correcta": false, "ejercicioCerrado": false, "puntos": 0,
  "guia": { "modo": "paso_a_paso", "pasos": [{ "orden": 1, "texto": "…" }] }, "mensaje": "¡Vamos juntos paso a paso!" }
// 201 fallo en intento 4
{ "correcta": false, "ejercicioCerrado": true,
  "guia": { "modo": "final", "pasos": [ … ], "respuestaCorrecta": { "valor": 5 } } }
```
Idempotente por `clienteId` (reintento devuelve la misma respuesta, 200). SLA p95 ≤ 2 s (RNF-01; objetivo ≤ 300 ms).

`GET /alumno/ejercicios/:ejercicioId/guia?asignacionId=` → `{ modo: 'paso_a_paso', pasos }` (botón Ayuda; marca `ayudaSolicitada`). SLA p95 ≤ 30 s si se genera con OpenAI (RNF-02).

### 3.4 Emociones (RI-06, RNF-03)
`POST /alumno/emociones/frame?asignacionId=uuid` · `Content-Type: image/jpeg` · máx. 100 KB · máx. 1 req / 5 s por alumno (429).
```json
// 200  (nunca devuelve la imagen ni guarda bytes)
{ "estadoDerivado": "frustracion", "indiceFrustracion": 0.64, "ofrecerAyuda": true }
```
`POST /alumno/alertas/:alertaId/respuesta` → `{ aceptaAyuda: boolean }` (RF-27 lado alumno; si true → R2 del motor).

### 3.5 Práctica libre y racha (RF-03, RF-67, RF-68)
| Método y ruta | Req | Res |
|---|---|---|
| `GET /alumno/practica` | — | Juegos disponibles `[{ tipo, temaId, nombre, icono }]` |
| `POST /alumno/practica` | `{ tipo, temaId }` | `{ practicaId, ejercicios: EjercicioPublico[5] }` |
| `POST /alumno/intentos` | (con `practicaId` en vez de `asignacionId`) | igual que 3.3 |
| `POST /alumno/practica/:id/completar` | — | `{ puntos, racha: { actual, mejor, incremento: true }, nuevasInsignias: [] }` |

---

## 4. Módulo Docente (`role=docente`)

### 4.1 Grupos y alumnos
| Método y ruta | Descripción |
|---|---|
| `GET /docente/grupos` | Grupos del docente con conteo de alumnos |
| `POST /docente/grupos` | `{ nombre, grado, cicloEscolar }` → genera `codigoAcceso` |
| `POST /docente/grupos/:id/alumnos` | `{ nombre, apellidos, avatar, pin[4], tutorEmail, intereses? }` → envía invitación de consentimiento |
| `GET /docente/grupos/:id/alumnos` | Lista con `estadoConsentimiento` |

### 4.2 Retroalimentación y resumen previo (RF-14, RF-62)
`GET /docente/grupos/:id/resumen?fecha=2026-10-26`
```json
{ "fecha": "2026-10-26",
  "grupo": { "conDiagnosticoHoy": 15, "total": 20,
             "distribucion": { "positivo": 7, "neutral": 5, "frustracion": 2, "desinteres": 1 },
             "afectoPositivoProm": 3.4, "afectoNegativoProm": 1.9,
             "dominioPromPorTema": { "suma": 3.2, "resta": 2.4 } },
  "alumnos": [{ "alumnoId": "uuid", "nombre": "Ana López", "estadoInicial": "positivo",
                "afectoPositivo": 4.0, "afectoNegativo": 1.4, "dominioPorTema": { "suma": 4, "resta": 2 },
                "fechaDato": "2026-10-26", "sinDatosHoy": false }] }
```
SLA p95 ≤ 30 s (RNF-02; objetivo ≤ 2 s).

### 4.3 Actividades (RF-56, RF-57, RF-58, RF-59)
`POST /docente/actividades`
```json
// req (destinos excluyentes)
{ "nombre": "Sumas 1", "temaId": "uuid", "tipoInteraccion": "seleccion_multiple",
  "fechaAsignacion": "2026-10-27", "numEjercicios": 10,
  "destino": { "tipo": "grupo", "grupoId": "uuid" } }
// o  "destino": { "tipo": "alumnos", "alumnoIds": ["uuid","uuid"] }
// 201
{ "actividadId": "uuid", "asignaciones": [{ "alumnoId": "uuid", "nivelInicial": 3, "sinDiagnostico": false }] }
```
`GET /docente/actividades/previsualizar-niveles?temaId=&grupoId=|alumnoIds=` → niveles iniciales sugeridos (paso 4 de CU-04).
`GET /docente/actividades?estado=activas&grupoId=` (RF-58)
```json
{ "items": [{ "actividadId": "uuid", "nombre": "Sumas 1", "tema": "Suma", "tipoInteraccion": "seleccion_multiple",
  "fechaAsignacion": "2026-10-27", "resumen": { "pendiente": 5, "enCurso": 3, "completada": 12 },
  "alumnos": [{ "alumnoId": "uuid", "nombre": "Ana López", "estado": "en_curso", "nivelInicial": 3, "nivelActual": 4 }] }],
  "nextCursor": null }
```
`GET /docente/historial?alumnoId=&temaId=&desde=&hasta=&grupoId=&cursor=` (RF-59) → finalizadas en orden `completadaEn DESC`: `{ items: [{ asignacionId, actividad, alumno, tema, completadaEn, resultadoFinal, nivelInicial, nivelFinal, tiempoTotalMs }] }`.

### 4.4 Alertas (RF-16, RF-27)
`GET /docente/alertas/stream` (SSE)
```
event: alerta.nueva
data: {"alertaId":"uuid","alumno":{"id":"uuid","nombre":"Luis R."},"actividad":"Restas 2","tema":"Resta",
       "indice":0.68,"senales":{"emocion":"frustracion","erroresConsecutivos":3,"inactividadSeg":40},
       "guia":{"id":"uuid","titulo":"Frustración durante el ejercicio"},"creadaEn":"..."}
```
| Método y ruta | Descripción |
|---|---|
| `GET /docente/alertas?pendientes=true` | Respaldo por polling |
| `GET /docente/guias/:id` | `{ titulo, pasos: [{orden, texto}] }` |
| `POST /docente/alertas/:id/atender` | `{ nota?: string }` → crea `nota_docente` si viene |

### 4.5 Alumno: ficha, perfil, notas, resultados, cruce (RF-29, RF-19, RF-50, RF-35, RF-52)
| Método y ruta | Respuesta (resumen) |
|---|---|
| `GET /docente/alumnos/:id` | `{ datos, estadoEmocionalReciente, ultimasNotas[3], resumenDesempeno }` (RF-29) |
| `GET /docente/alumnos/:id/perfil-estadistico?temaId=` | `{ porTema: [{ tema, tiempoPromedioMs, intentosPromedio, porcentajeAciertos, erroresPorTipo: {calculo: 4, …}, habilidadesMenorDominio: [{ subtema, porcentajeAciertos }] }] }` (RF-19) |
| `GET /docente/alumnos/:id/notas` · `POST` `{ texto, etiqueta? }` | fecha automática (RF-50) |
| `GET /docente/alumnos/:id/resultados` · `POST` `{ temaId, tipo: 'tarea'|'trabajo_clase'|'interrogacion', titulo, calificacion, fecha }` | consolidado por tema (RF-35) |
| `GET /docente/alumnos/:id/cruce` | `{ porTema: [{ tema, promedioAcademico, porcentajeFrustracion, afectoNegativoProm, coincidencia: true }] }` (RF-52) |
| `GET /docente/alumnos/:id/emociones?desde=&hasta=` | Serie temporal de `estadoDerivado` (sin imágenes) |

### 4.6 Reportes (RF-18)
`GET /docente/grupos/:id/reportes/temas?desde=&hasta=&orden=error|frustracion`
```json
{ "items": [{ "tema": "Resta", "subtema": "Con préstamo", "indiceError": 0.42, "indiceFrustracion": 0.31,
              "intentos": 380, "alumnosAfectados": 9 }] }
```
`GET …/reportes/temas.csv` → CSV (auditado `exportar`).

### 4.7 Catálogos
`GET /catalogo/temas` · `GET /catalogo/tipos-interaccion` (ambos roles).
