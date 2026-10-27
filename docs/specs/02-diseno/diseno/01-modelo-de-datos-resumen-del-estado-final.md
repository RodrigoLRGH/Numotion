# Modelo de datos — estado final

PostgreSQL 16. Migración `0001_esquema.sql`. Todas las tablas tienen `id uuid PK default gen_random_uuid()` y `creado_en timestamptz default now()` salvo que se indique. **Ninguna tabla contiene imágenes ni bytes faciales (RNF-03, RC-05).**

## 1. Diagrama entidad-relación (resumen)

```
docente 1──* grupo 1──* alumno 1──1 consentimiento_tutor (vigente)
                │            │
                │            ├──* sesion_alumno 1──1 panas_resultado
                │            │          │        1──* diagnostico_mat_resultado
                │            │          │        1──1 retroalimentacion
                │            │          └──* evento_emocional
                │            ├──1 racha_alumno
                │            ├──1 perfil_gamificacion ──* alumno_insignia *──1 insignia
                │            ├──* practica_libre
                │            ├──* nota_docente
                │            └──* resultado_academico *──1 tema
                │
docente 1──* actividad *──1 tema 1──* subtema
               │
               └──* asignacion_alumno *──1 alumno
                        ├──* intento_ejercicio *──1 ejercicio
                        ├──* ajuste_dificultad
                        └──* alerta

tema 1──* ejercicio (nivel 1..5, tipo_interaccion)
tema 1──* pregunta_diagnostico
panas_item, guia_actuacion, mensaje_motivacional, insignia, config_adaptativa  (catálogos)
auditoria_acceso (append-only)
```

## 2. Enumeraciones

```sql
CREATE TYPE rol_usuario        AS ENUM ('docente','alumno','admin');
CREATE TYPE tipo_interaccion   AS ENUM ('seleccion_multiple','arrastrar','numero_a_palabras',
                                        'identificar_numero','suma_figuras','completar_operacion',
                                        'colorear_figura');
CREATE TYPE estado_asignacion  AS ENUM ('pendiente','en_curso','completada');
CREATE TYPE destino_actividad  AS ENUM ('grupo','alumnos');
CREATE TYPE emocion_rekognition AS ENUM ('HAPPY','CALM','SURPRISED','CONFUSED','SAD','ANGRY',
                                         'FEAR','DISGUSTED','UNKNOWN','SIN_ROSTRO');
CREATE TYPE estado_emocional   AS ENUM ('positivo','neutral','frustracion','desinteres','sin_dato');
CREATE TYPE motivo_ajuste      AS ENUM ('desempeno','emocion','combinado','solicitud_ayuda','inicial');
CREATE TYPE origen_ejercicio   AS ENUM ('catalogo','openai');
CREATE TYPE tipo_resultado     AS ENUM ('tarea','trabajo_clase','interrogacion','actividad_numotion');
CREATE TYPE tipo_error         AS ENUM ('calculo','procedimiento','lectura','ortografia','seleccion','tiempo_agotado','otro');
```

## 3. Tablas

### 3.1 Identidad y grupos
| Tabla | Columnas clave | Restricciones |
|---|---|---|
| `docente` | `nombre`, `email` (citext, único), `password_hash`, `activo` | — |
| `grupo` | `docente_id` FK, `nombre` ("3A"), `grado` smallint, `ciclo_escolar` ("2026-2027"), `codigo_acceso` char(6) | `UNIQUE(codigo_acceso)`, `CHECK (grado BETWEEN 1 AND 9)` |
| `alumno` | `grupo_id` FK, `nombre`, `apellidos`, `avatar` text, `pin_hash`, `intentos_fallidos` int, `bloqueado_hasta` timestamptz, `intereses` text[], `activo` | `UNIQUE(grupo_id, avatar)` (avatar único dentro del grupo) |
| `consentimiento_tutor` | `alumno_id` FK, `tutor_nombre`, `tutor_email`, `parentesco`, `version_aviso`, `acepta_plataforma` bool, `acepta_camara` bool, `metodo_verificacion` ('email_otp'), `ip`, `aceptado_en`, `revocado_en`, `token_hash`, `token_expira_en` | Índice parcial único `(alumno_id) WHERE revocado_en IS NULL AND aceptado_en IS NOT NULL` |

> El grado del alumno se toma de `grupo.grado` (RF-65).

### 3.2 Catálogo pedagógico
| Tabla | Columnas clave |
|---|---|
| `tema` | `clave` (único: `numeros`, `suma`, `resta`, `multiplicacion`, `division`, `geometria`, `fracciones`), `nombre`, `grado_min`, `grado_max`, `orden` |
| `subtema` | `tema_id`, `clave`, `nombre` (p. ej. suma → "sin llevar", "llevando") |
| `ejercicio` | `tema_id`, `subtema_id`, `tipo_interaccion`, `nivel` smallint `CHECK 1..5`, `enunciado` jsonb, `respuesta` jsonb, `opciones` jsonb null, `pasos_solucion` jsonb (≥ 2 pasos), `origen`, `activo` |
| `pregunta_diagnostico` | `tema_id`, `grado`, `nivel` 1..5, `enunciado` jsonb, `opciones` jsonb, `respuesta` jsonb |
| `panas_item` | `orden`, `texto`, `afecto` ('positivo'/'negativo'), `audio_url`, `version` |

Estructura de `ejercicio.enunciado` / `respuesta` por tipo (validada con Zod en `packages/contracts/ejercicio.ts`):
```jsonc
// completar_operacion (RF-42)
{ "enunciado": { "operacion": "suma", "a": 7, "b": null, "resultado": 12 },
  "opciones": [3, 5, 6, 8], "respuesta": { "valor": 5 } }
// numero_a_palabras (RF-39)
{ "enunciado": { "numeros": [15] }, "respuesta": { "textos": ["quince"] } }
// identificar_numero (RF-40)
{ "enunciado": { "objetivo": 47, "mostrados": [12, 47, 83, 29, 65, 3] }, "respuesta": { "valor": 47 } }
// suma_figuras (RF-41)
{ "enunciado": { "grupos": [{ "figura": "manzana", "cantidad": 3 }, { "figura": "manzana", "cantidad": 4 }] },
  "respuesta": { "valor": 7 } }
// colorear_figura (RF-44)
{ "enunciado": { "lienzo": "svg-id", "figuras": [{ "id": "f1", "tipo": "triangulo" }, { "id": "f2", "tipo": "circulo" }],
                 "instruccion": { "tipo": "triangulo", "color": "rojo" } },
  "respuesta": { "coloreo": { "f1": "rojo" } } }
// seleccion_multiple / arrastrar
{ "enunciado": { "texto": "¿Cuánto es 3 × 4?" }, "opciones": [7, 12, 14, 34], "respuesta": { "valor": 12 } }
// pasos_solucion (RF-11, RF-45)
[ { "orden": 1, "texto": "Tenemos 7 y queremos llegar a 12", "visual": "recta-7-12" },
  { "orden": 2, "texto": "Contamos de 7 a 12: 8, 9, 10, 11, 12", "visual": null },
  { "orden": 3, "texto": "Contamos 5 saltos, entonces falta 5", "revela_respuesta": true } ]
```

### 3.3 Sesión y diagnósticos
| Tabla | Columnas clave | Restricciones |
|---|---|---|
| `sesion_alumno` | `alumno_id`, `fecha` date (zona `America/Tijuana`), `iniciada_en`, `ultima_actividad_en`, `finalizada_en` | `UNIQUE(alumno_id, fecha)` |
| `panas_resultado` | `sesion_id` (único), `alumno_id`, `respuestas` jsonb `[{itemId, valor 1..5}]`, `afecto_positivo` numeric(3,2), `afecto_negativo` numeric(3,2), `completado_en` | AP/AN = promedio 1–5 |
| `diagnostico_mat_resultado` | `sesion_id`, `alumno_id`, `tema_id`, `aciertos`, `total`, `nivel_dominio` smallint 1..5, `tiempo_total_ms` | `UNIQUE(sesion_id, tema_id)` |
| `retroalimentacion` | `sesion_id` (único), `alumno_id`, `panas_id`, `estado_inicial` estado_emocional, `dominio_por_tema` jsonb `{temaId: nivel}`, `nivel_sugerido_por_tema` jsonb, `observaciones` text[] | RF-61 |

### 3.4 Actividades
| Tabla | Columnas clave | Restricciones |
|---|---|---|
| `actividad` | `docente_id`, `nombre`, `tema_id`, `tipo_interaccion`, `fecha_asignacion` date, `num_ejercicios` smallint default 10, `destino` destino_actividad, `grupo_id` null | `CHECK ((destino='grupo') = (grupo_id IS NOT NULL))`, `CHECK (num_ejercicios BETWEEN 3 AND 30)` |
| `asignacion_alumno` | `actividad_id`, `alumno_id`, `nivel_inicial`, `nivel_actual`, `estado`, `ejercicios_resueltos`, `puntaje`, `resultado_final` numeric(4,2) null (0–10), `iniciada_en`, `completada_en` | `UNIQUE(actividad_id, alumno_id)`, `CHECK nivel_* BETWEEN 1 AND 5` |
| `intento_ejercicio` | `asignacion_id` null, `practica_id` null, `alumno_id`, `ejercicio_id`, `nivel`, `respuesta` jsonb, `correcta` bool, `tipo_error` null, `numero_intento` smallint, `tiempo_ms` int, `ayuda_solicitada` bool, `guia_mostrada` ('ninguna','paso_a_paso','final'), `cliente_id` uuid (idempotencia) | `CHECK (num_nonnulls(asignacion_id, practica_id) = 1)`, `UNIQUE(cliente_id)`, `CHECK (tiempo_ms >= 0)` |
| `ajuste_dificultad` | `asignacion_id`, `nivel_anterior`, `nivel_nuevo`, `motivo`, `detalle` jsonb (señales usadas) | |

### 3.5 Emoción y alertas
| Tabla | Columnas clave | Notas |
|---|---|---|
| `evento_emocional` | `alumno_id`, `sesion_id`, `asignacion_id` null, `emocion` emocion_rekognition, `confianza` numeric(5,2), `estado_derivado` estado_emocional, `capturado_en` | **Sin imagen.** Retención 180 días (job de purga) |
| `alerta` | `alumno_id`, `docente_id`, `asignacion_id`, `tipo` ('frustracion_temprana'), `indice` numeric(3,2), `senales` jsonb, `guia_id`, `alumno_acepto_ayuda` bool null, `atendida_en`, `atendida_por` | Índice `(docente_id, atendida_en) WHERE atendida_en IS NULL` |
| `guia_actuacion` | `estado` estado_emocional, `titulo`, `pasos` jsonb `[{orden, texto}]`, `mensaje_alumno` | Catálogo RF-27 |
| `config_adaptativa` | `clave` PK, `valor` jsonb | Umbrales del motor (ver archivo 02 §3) |

### 3.6 Gamificación
| Tabla | Columnas clave | Restricciones |
|---|---|---|
| `perfil_gamificacion` | `alumno_id` PK, `puntos_totales`, `nivel_gamificacion` smallint, `personaje` text | Nivel = f(puntos) (archivo 02 §4) |
| `insignia` | `clave` (único), `nombre`, `descripcion`, `icono`, `regla` jsonb | Catálogo |
| `alumno_insignia` | `alumno_id`, `insignia_id`, `obtenida_en` | `UNIQUE(alumno_id, insignia_id)` |
| `practica_libre` | `alumno_id`, `juego` tipo_interaccion, `tema_id`, `iniciada_en`, `completada_en` null, `puntos` | |
| `racha_alumno` | `alumno_id` PK, `racha_actual` int, `mejor_racha` int, `ultimo_dia_habil` date null | `CHECK (mejor_racha >= racha_actual)` |
| `mensaje_motivacional` | `texto` con placeholders (`{nombre}`, `{racha}`), `condicion` jsonb (estado_inicial, racha≥) | Catálogo RF-22 |

### 3.7 Docente: notas y resultados
| Tabla | Columnas clave | Restricciones |
|---|---|---|
| `nota_docente` | `docente_id`, `alumno_id`, `fecha` timestamptz default now(), `texto` (1–500), `etiqueta` null ('conducta','emocional','academico','otro') | RF-50: 3 campos de captura |
| `resultado_academico` | `alumno_id`, `tema_id`, `tipo` tipo_resultado, `titulo`, `calificacion` numeric(4,2) 0–10, `fecha` date, `asignacion_id` null, `capturado_por` | Si `tipo='actividad_numotion'`, `asignacion_id` NOT NULL |

### 3.8 Auditoría (RC-07)
`auditoria_acceso`: `actor_id`, `actor_rol`, `accion` ('login','login_fallido','ver_alumno','exportar','acceso_denegado','consentimiento','revocacion','arco'), `recurso`, `recurso_id`, `ip`, `creado_en`. Solo INSERT (revocar UPDATE/DELETE al rol de la app).

## 4. Vistas (migración `0003_vistas.sql`)

| Vista | Uso | Definición resumida |
|---|---|---|
| `v_estado_emocional_reciente` | RF-14, RF-29 | Por alumno: última `retroalimentacion` + estado derivado modal de los `evento_emocional` de la última sesión |
| `v_perfil_estadistico` | RF-19 | Por (alumno, tema): `avg(tiempo_ms)`, `avg(numero_intento)` de intentos correctos, conteo por `tipo_error`, `% aciertos`; habilidades de menor dominio = 3 subtemas con menor % aciertos (mín. 5 intentos) |
| `mv_indice_tema_grupo` (materializada, refresco cada 15 min y al cerrar asignación) | RF-18 | Por (grupo, tema, subtema, semana): `indice_error = intentos incorrectos / intentos`; `indice_frustracion = eventos con estado 'frustracion' / eventos con dato` |
| `v_resultado_consolidado` | RF-35 | Por (alumno, tema): promedio por `tipo_resultado` + promedio general |
| `v_cruce_academico_emocional` | RF-52 | Join `v_resultado_consolidado` × por (alumno, tema): `% eventos frustracion`, AP/AN promedio de sesiones con actividad del tema; bandera `coincidencia = (promedio < 6 AND frustracion > 0.3)` |

## 5. Índices principales
- `asignacion_alumno (alumno_id, estado)`; `(actividad_id)`.
- `intento_ejercicio (asignacion_id, creado_en)`; `(alumno_id, creado_en)`.
- `evento_emocional (sesion_id, capturado_en DESC)`; `(asignacion_id, capturado_en DESC)`.
- `practica_libre (alumno_id, completada_en)`.
- `nota_docente (alumno_id, fecha DESC)`.

## 6. Retención y borrado (RC-07)
| Dato | Retención | Mecanismo |
|---|---|---|
| `evento_emocional` | 180 días | Job diario `fn_purgar_eventos_emocionales()` |
| `auditoria_acceso` | 2 años | Job mensual |
| Datos del alumno tras revocación o solicitud ARCO de cancelación | Borrado en ≤ 20 días hábiles | `fn_anonimizar_alumno(alumno_id)`: borra PII, conserva agregados anónimos |
