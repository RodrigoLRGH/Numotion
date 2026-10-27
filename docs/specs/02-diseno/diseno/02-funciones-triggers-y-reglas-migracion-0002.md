# Funciones, triggers y reglas de negocio — migración `0002_funciones_triggers.sql`

Este archivo define (1) las funciones y triggers de BD y (2) las reglas de dominio que se implementan en TypeScript como **funciones puras** en `apps/api/src/modules/core`. Las constantes viven en `config_adaptativa` (valores por defecto entre corchetes).

---

## 1. Utilidades de calendario (RF-67)

```sql
-- Fecha local de la escuela
CREATE FUNCTION fn_hoy_local() RETURNS date LANGUAGE sql STABLE AS
$$ SELECT (now() AT TIME ZONE 'America/Tijuana')::date $$;

CREATE FUNCTION fn_es_dia_habil(d date) RETURNS boolean LANGUAGE sql IMMUTABLE AS
$$ SELECT extract(isodow FROM d) BETWEEN 1 AND 5 $$;

-- Días hábiles estrictamente entre a y b (excluye ambos extremos)
CREATE FUNCTION fn_dias_habiles_entre(a date, b date) RETURNS int LANGUAGE sql IMMUTABLE AS
$$ SELECT count(*)::int FROM generate_series(a + 1, b - 1, interval '1 day') g(d)
   WHERE extract(isodow FROM g.d) BETWEEN 1 AND 5 $$;
```
> Días festivos SEP: fuera del MVP; preparar tabla `dia_inhabil` vacía para extender `fn_es_dia_habil`.

## 2. Racha (RF-67, RF-68)

**Reglas:**
1. La racha cuenta **días hábiles** (lun–vie) consecutivos con ≥ 1 `practica_libre` completada.
2. Suma 1 solo con la **primera** práctica completada del día hábil.
3. Se reinicia a 0 cuando **termina** un día hábil sin práctica. Sábado y domingo no interrumpen.
4. Una práctica completada en fin de semana da puntos pero **no suma racha** (interpretación A-15).
5. `mejor_racha` = máximo histórico; nunca disminuye.

```sql
CREATE FUNCTION fn_registrar_practica() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d date := (NEW.completada_en AT TIME ZONE 'America/Tijuana')::date;
        r racha_alumno%ROWTYPE;
BEGIN
  IF NEW.completada_en IS NULL OR OLD.completada_en IS NOT NULL OR NOT fn_es_dia_habil(d) THEN
    RETURN NEW;
  END IF;
  INSERT INTO racha_alumno(alumno_id, racha_actual, mejor_racha) VALUES (NEW.alumno_id, 0, 0)
    ON CONFLICT (alumno_id) DO NOTHING;
  SELECT * INTO r FROM racha_alumno WHERE alumno_id = NEW.alumno_id FOR UPDATE;  -- concurrencia
  IF r.ultimo_dia_habil = d THEN RETURN NEW; END IF;                               -- regla 2
  IF r.ultimo_dia_habil IS NOT NULL AND fn_dias_habiles_entre(r.ultimo_dia_habil, d) = 0 THEN
    r.racha_actual := r.racha_actual + 1;
  ELSE
    r.racha_actual := 1;
  END IF;
  UPDATE racha_alumno SET racha_actual = r.racha_actual,
         mejor_racha = greatest(r.mejor_racha, r.racha_actual),
         ultimo_dia_habil = d
   WHERE alumno_id = NEW.alumno_id;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_practica_racha AFTER UPDATE OF completada_en ON practica_libre
  FOR EACH ROW EXECUTE FUNCTION fn_registrar_practica();

-- Lectura: la racha almacenada puede estar "vencida"; siempre leer con esta función
CREATE FUNCTION fn_racha_vigente(p_alumno uuid, p_hoy date DEFAULT fn_hoy_local())
RETURNS TABLE(racha_actual int, mejor_racha int) LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN r.ultimo_dia_habil IS NULL THEN 0
              WHEN fn_dias_habiles_entre(r.ultimo_dia_habil, p_hoy) > 0 THEN 0
              ELSE r.racha_actual END,
         r.mejor_racha
  FROM racha_alumno r WHERE r.alumno_id = p_alumno $$;
```
Casos (P-DB-01): vie→lun = +1; lun→mié (sin mar) = 0 al leer el mié y 1 al practicar el mié; 3 prácticas el mismo día = +1; práctica en sábado = sin cambio.

## 3. Motor adaptativo (RF-01, RF-21) — `core/adaptive`

### 3.1 Estado emocional derivado (por frame)
| Emoción Rekognition dominante | Confianza | Estado derivado |
|---|---|---|
| HAPPY, SURPRISED | ≥ `conf_min` [60] | `positivo` |
| CALM | ≥ 60 | `neutral` |
| CONFUSED, ANGRY, SAD, FEAR, DISGUSTED | ≥ 60 | `frustracion` |
| cualquiera | < 60 | `sin_dato` |
| sin rostro (FaceDetails vacío) | — | `sin_dato` (emocion `SIN_ROSTRO`) |

**Estado de ventana** (últimos `ventana_seg` [60] s, con ≥ 2 muestras con dato): modal de los estados derivados; empate → el más negativo. Se marca `desinteres` si ≥ 80 % `neutral` **y** (inactividad > `inactividad_seg` [45] **o** `SIN_ROSTRO` en ≥ 3 muestras consecutivas).

### 3.2 Estado inicial desde PANAS-C (RF-61)
AP y AN = promedio 1–5 de sus ítems.
| Condición (en orden) | `estado_inicial` |
|---|---|
| AN ≥ 3.0 | `frustracion` (afecto negativo alto) |
| AP ≥ 3.5 y AN < 2.5 | `positivo` |
| AP < 2.5 | `desinteres` |
| otro | `neutral` |

### 3.3 Índice de Frustración (RF-16)
```
IF = 0.4·E + 0.3·min(errores_consecutivos/3, 1) + 0.2·min(inactividad_seg/60, 1) + 0.1·min(ayudas_en_ejercicio/2, 1)
E  = proporción de muestras 'frustracion' entre las muestras con dato de la ventana
```
- Sin cámara (sin consentimiento o denegada): se omite E y los pesos se renormalizan: 0.5 / 0.33 / 0.17.
- Se evalúa en cada intento y en cada frame. **Alerta** si IF ≥ `umbral_alerta` [0.6] en **2 evaluaciones consecutivas**; enfriamiento de `cooldown_alerta_min` [5] por (alumno, asignación).

### 3.4 Regla de decisión de nivel
Firma: `decidirNivel(input: EntradaAdaptativa): { nivelNuevo: 1|2|3|4|5; motivo: MotivoAjuste | null; reglas: string[] }`

Entradas: `nivelActual`, `ultimos3` (ejercicios cerrados: `correctoPrimerIntento`, `correcto`, `tiempoMs`), `tiempoReferenciaMs` (mediana histórica del ejercicio/nivel, default 30 000), `estadoVentana`, `IF`, `erroresConsecutivos`, `ejerciciosDesdeUltimoCambio`, `aceptoAyuda`.

| Orden | Regla | Condición | Efecto | Motivo |
|---|---|---|---|---|
| R1 | Frustración | `IF ≥ 0.6` **o** (`estadoVentana = frustracion` y `erroresConsecutivos ≥ 2`) | −1 | `combinado` (o `emocion` si errores < 2) |
| R2 | Ayuda aceptada | `aceptoAyuda` (RF-27, lado alumno) | −1 | `solicitud_ayuda` |
| R0 | Enfriamiento | `ejerciciosDesdeUltimoCambio < 2` (no aplica a R1/R2) | sin cambio | — |
| R3 | Bajo desempeño | `count(correcto) en ultimos3 ≤ 1` | −1 | `desempeno` |
| R4 | Dominio | 3/3 `correctoPrimerIntento` y mediana(tiempo) ≤ 1.2 × referencia y estado ≠ `frustracion` | +1 | `desempeno` (o `combinado` si `desinteres`) |
| R5 | Re-enganche | `estadoVentana = desinteres` y ≥ 2/3 correctos | +1 | `emocion` |
| — | Por defecto | — | sin cambio | — |

Siempre `nivelNuevo = clamp(nivel, 1, 5)` (RF-01). El cambio ocurre **dentro del mismo tema** de la asignación (RF-21). Si `nivelNuevo ≠ nivelActual` se inserta `ajuste_dificultad` con `detalle = {IF, estadoVentana, ultimos3, reglas}`.

### 3.5 Nivel inicial de una asignación (RF-57)
```sql
CREATE FUNCTION fn_nivel_inicial(p_alumno uuid, p_tema uuid) RETURNS smallint LANGUAGE plpgsql STABLE AS $$
DECLARE base smallint; est estado_emocional;
BEGIN
  SELECT d.nivel_dominio INTO base FROM diagnostico_mat_resultado d
   WHERE d.alumno_id = p_alumno AND d.tema_id = p_tema AND d.creado_en > now() - interval '30 days'
   ORDER BY d.creado_en DESC LIMIT 1;
  IF base IS NULL THEN RETURN 2; END IF;                       -- sin diagnóstico (CU-04 A1)
  SELECT r.estado_inicial INTO est FROM retroalimentacion r
   WHERE r.alumno_id = p_alumno ORDER BY r.creado_en DESC LIMIT 1;
  IF est = 'frustracion' THEN base := base - 1; END IF;
  RETURN greatest(1, least(5, base));
END $$;
```
Al iniciar la actividad, si la retroalimentación **del día** difiere de la usada al asignar, `nivel_actual` se recalcula una vez con la misma función (motivo `inicial`).

### 3.6 Nivel de dominio del diagnóstico (RF-55)
Por tema se presentan preguntas de nivel 1 a 5 de forma escalonada (inicia en 2; acierto → sube, fallo → baja; 3–5 preguntas). `nivel_dominio` = nivel más alto acertado sin fallar el inmediato inferior; 1 si no acierta ninguna.

## 4. Ejercicios, puntos y gamificación (RF-03, RF-11, RF-45)

**Ciclo de un ejercicio** (`max_intentos` [4]):
| Intento | Si falla |
|---|---|
| 1, 2 | Mensaje positivo + reintento |
| 3 | Se abre automáticamente la **guía paso a paso** (RF-11); reintento 4 |
| 4 | Ejercicio **cerrado incorrecto** → **explicación final** con solución (RF-45) |
El botón "Ayuda" abre la guía en cualquier intento (`ayuda_solicitada = true`).

**Puntos por ejercicio correcto:** intento 1 = 10, intento 2 = 7, intento 3 = 5, tras guía = 3. Práctica libre completada = 5. Sin puntos negativos.

**Nivel de gamificación:** nivel `n` requiere `50·n·(n−1)` puntos (1: 0, 2: 100, 3: 300, 4: 600, 5: 1000…), máx. 20. Cada nivel desbloquea un accesorio del personaje.

**Insignias iniciales (catálogo `insignia.regla`):**
| Clave | Regla |
|---|---|
| `primera_actividad` | 1.ª asignación completada |
| `racha_5`, `racha_10` | `racha_actual` alcanza 5 / 10 |
| `valiente` | Pidió ayuda y luego acertó 3 ejercicios seguidos |
| `constante` | 20 prácticas libres completadas |
| `explorador` | Prácticas en ≥ 4 tipos de juego |
| `maestro_<tema>` | 5 asignaciones del tema con `resultado_final ≥ 8` |

## 5. Trigger de avance de asignación (RF-60, RF-35)

```sql
CREATE FUNCTION fn_intento_actualiza_asignacion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a asignacion_alumno%ROWTYPE; cerrado boolean; total smallint; correctos int;
BEGIN
  IF NEW.asignacion_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO a FROM asignacion_alumno WHERE id = NEW.asignacion_id FOR UPDATE;
  IF a.estado = 'completada' THEN RAISE EXCEPTION 'ASIGNACION_COMPLETADA'; END IF;
  IF a.estado = 'pendiente' THEN
    a.estado := 'en_curso'; a.iniciada_en := now();
  END IF;
  cerrado := NEW.correcta OR NEW.numero_intento >= 4;
  IF cerrado THEN a.ejercicios_resueltos := a.ejercicios_resueltos + 1; END IF;
  SELECT num_ejercicios INTO total FROM actividad WHERE id = a.actividad_id;
  IF a.ejercicios_resueltos >= total THEN
    SELECT count(DISTINCT ejercicio_id) INTO correctos FROM intento_ejercicio
     WHERE asignacion_id = a.id AND correcta;
    a.estado := 'completada'; a.completada_en := now();
    a.resultado_final := round(10.0 * correctos / total, 2);
    INSERT INTO resultado_academico(alumno_id, tema_id, tipo, titulo, calificacion, fecha, asignacion_id)
    SELECT a.alumno_id, ac.tema_id, 'actividad_numotion', ac.nombre, a.resultado_final, fn_hoy_local(), a.id
      FROM actividad ac WHERE ac.id = a.actividad_id;
  END IF;
  UPDATE asignacion_alumno SET estado = a.estado, iniciada_en = a.iniciada_en,
         ejercicios_resueltos = a.ejercicios_resueltos, completada_en = a.completada_en,
         resultado_final = a.resultado_final
   WHERE id = a.id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_intento_asignacion AFTER INSERT ON intento_ejercicio
  FOR EACH ROW EXECUTE FUNCTION fn_intento_actualiza_asignacion();
```
> Los puntos (`puntaje`, `perfil_gamificacion`) los suma el servicio en la **misma transacción**, porque dependen de reglas de TypeScript.

## 6. Registro atómico de asignación (RF-56, RF-57)

```sql
CREATE FUNCTION fn_registrar_asignacion(
  p_docente uuid, p_nombre text, p_tema uuid, p_tipo tipo_interaccion, p_fecha date,
  p_num smallint, p_grupo uuid, p_alumnos uuid[]
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_act uuid; v_destinos uuid[];
BEGIN
  IF (p_grupo IS NULL) = (coalesce(array_length(p_alumnos,1),0) = 0) THEN
    RAISE EXCEPTION 'ASIGNACION_DESTINO_INVALIDO';            -- excluyente
  END IF;
  IF p_grupo IS NOT NULL THEN
    PERFORM 1 FROM grupo WHERE id = p_grupo AND docente_id = p_docente;
    IF NOT FOUND THEN RAISE EXCEPTION 'GRUPO_NO_PERMITIDO'; END IF;
    SELECT array_agg(id) INTO v_destinos FROM alumno WHERE grupo_id = p_grupo AND activo;
  ELSE
    SELECT array_agg(a.id) INTO v_destinos FROM alumno a JOIN grupo g ON g.id = a.grupo_id
     WHERE a.id = ANY(p_alumnos) AND g.docente_id = p_docente AND a.activo;
    IF array_length(v_destinos,1) <> array_length(p_alumnos,1) THEN
      RAISE EXCEPTION 'ALUMNO_NO_PERMITIDO';
    END IF;
  END IF;
  INSERT INTO actividad(docente_id, nombre, tema_id, tipo_interaccion, fecha_asignacion, num_ejercicios,
                        destino, grupo_id)
  VALUES (p_docente, p_nombre, p_tema, p_tipo, p_fecha, p_num,
          CASE WHEN p_grupo IS NULL THEN 'alumnos' ELSE 'grupo' END, p_grupo)
  RETURNING id INTO v_act;
  INSERT INTO asignacion_alumno(actividad_id, alumno_id, nivel_inicial, nivel_actual, estado)
  SELECT v_act, x, fn_nivel_inicial(x, p_tema), fn_nivel_inicial(x, p_tema), 'pendiente'
    FROM unnest(v_destinos) x;
  RETURN v_act;
END $$;
```

## 7. Retroalimentación (RF-61)

`fn_generar_retroalimentacion(p_sesion uuid)`: se llama cuando existen `panas_resultado` **y** al menos un `diagnostico_mat_resultado` de la sesión. Inserta (idempotente, `ON CONFLICT (sesion_id) DO UPDATE`) `estado_inicial` (§3.2), `dominio_por_tema`, `nivel_sugerido_por_tema` (= `fn_nivel_inicial` por tema) y `observaciones` (p. ej. "AN alto y dominio bajo en resta").

## 8. Otros
| Objeto | Propósito |
|---|---|
| `fn_purgar_eventos_emocionales()` | Borra `evento_emocional` > 180 días (pg_cron o EventBridge → Lambda) |
| `fn_anonimizar_alumno(uuid)` | ARCO/revocación: nombre → "Alumno anonimizado", borra PIN, intereses, notas y eventos emocionales |
| `trg_auditoria_inmutable` | `BEFORE UPDATE OR DELETE ON auditoria_acceso` → `RAISE EXCEPTION` |
| `trg_tocar_sesion` | Actualiza `sesion_alumno.ultima_actividad_en` en cada intento/evento |
| `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_indice_tema_grupo` | Cada 15 min y al completar una asignación (vía `NOTIFY` + worker) |
