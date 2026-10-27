# Pruebas de base de datos (pgTAP)

## 1. Ejecución
- Imagen `postgres:16` con extensión `pgtap`.
- `db/tests/*.sql`, cada archivo en `BEGIN … ROLLBACK`.
- Runner: `pg_prove -d $TEST_DATABASE_URL db/tests/*.sql`.
- Antes: aplicar migraciones 0001–0005 + `db/seed/test_fixture.sql`.

## 2. P-DB-01 · Racha (RF-67, RF-68)
```sql
BEGIN;
SELECT plan(7);
-- alumno de prueba
INSERT INTO racha_alumno(alumno_id, racha_actual, mejor_racha, ultimo_dia_habil)
VALUES ('00000000-0000-0000-0000-0000000000a1', 4, 4, '2026-10-23');  -- viernes

-- helper: completa una práctica en una fecha/hora local
CREATE FUNCTION pg_temp.practicar(d timestamptz) RETURNS void LANGUAGE sql AS $$
  INSERT INTO practica_libre(alumno_id, juego, tema_id, iniciada_en)
  VALUES ('00000000-0000-0000-0000-0000000000a1','identificar_numero',(SELECT id FROM tema LIMIT 1), d);
  UPDATE practica_libre SET completada_en = d
   WHERE alumno_id = '00000000-0000-0000-0000-0000000000a1' AND completada_en IS NULL; $$;

SELECT pg_temp.practicar('2026-10-24 10:00-07');           -- sábado
SELECT is((SELECT racha_actual FROM racha_alumno WHERE alumno_id='00000000-0000-0000-0000-0000000000a1'), 4, 'sábado no suma');
SELECT pg_temp.practicar('2026-10-26 10:00-07');           -- lunes
SELECT is((SELECT racha_actual FROM racha_alumno WHERE alumno_id='00000000-0000-0000-0000-0000000000a1'), 5, 'vie→lun suma');
SELECT pg_temp.practicar('2026-10-26 12:00-07');           -- lunes otra vez
SELECT is((SELECT racha_actual FROM racha_alumno WHERE alumno_id='00000000-0000-0000-0000-0000000000a1'), 5, 'una vez por día');
SELECT is((SELECT racha_actual FROM fn_racha_vigente('00000000-0000-0000-0000-0000000000a1','2026-10-27')), 5, 'martes aún vigente');
SELECT is((SELECT racha_actual FROM fn_racha_vigente('00000000-0000-0000-0000-0000000000a1','2026-10-28')), 0, 'miércoles sin martes = 0');
SELECT pg_temp.practicar('2026-10-28 09:00-07');           -- miércoles
SELECT is((SELECT racha_actual FROM racha_alumno WHERE alumno_id='00000000-0000-0000-0000-0000000000a1'), 1, 'reinicia en 1');
SELECT is((SELECT mejor_racha FROM racha_alumno WHERE alumno_id='00000000-0000-0000-0000-0000000000a1'), 5, 'mejor racha conservada');
SELECT * FROM finish();
ROLLBACK;
```
(El fixture crea antes el alumno `…a1` en un grupo.)

## 3. P-DB-02 · `fn_nivel_inicial`
| Diagnóstico (≤ 30 días) | Retroalimentación más reciente | Esperado |
|---|---|---|
| ninguno | — | 2 |
| dominio 4 | positivo | 4 |
| dominio 4 | frustracion | 3 |
| dominio 1 | frustracion | 1 |
| dominio 5 hace 40 días | — | 2 |

## 4. P-DB-03 · Trigger de asignación
1. Asignación `pendiente`, `num_ejercicios = 3`.
2. Intento correcto → `en_curso`, `ejercicios_resueltos = 1`, `iniciada_en` no nulo.
3. Intentos 1–4 incorrectos del ejercicio 2 → `ejercicios_resueltos = 2` (cerrado en el 4.º).
4. Intento correcto del ejercicio 3 → `completada`, `resultado_final = 6.67`, existe `resultado_academico` tipo `actividad_numotion`.
5. Nuevo intento → `throws_ok(…, 'ASIGNACION_COMPLETADA')`.

## 5. P-DB-04 · RLS (RNF-04)
```sql
SET ROLE numotion_app;
SELECT set_config('app.user_id', :'docente_a', true), set_config('app.role','docente', true);
SELECT is((SELECT count(*) FROM alumno WHERE grupo_id = :'grupo_de_b')::int, 0, 'A no ve alumnos de B');
SELECT is((SELECT count(*) FROM nota_docente WHERE alumno_id = :'alumno_de_b')::int, 0, 'A no ve notas de B');
SELECT throws_ok($$ INSERT INTO nota_docente(docente_id, alumno_id, texto)
                    VALUES (current_setting('app.user_id')::uuid, '<alumno_de_b>', 'x') $$, '42501');
SELECT set_config('app.user_id', :'alumno_a1', true), set_config('app.role','alumno', true);
SELECT is((SELECT count(*) FROM evento_emocional)::int, 0, 'alumno no lee sus eventos emocionales');
SELECT is((SELECT count(*) FROM alumno)::int, 1, 'alumno solo se ve a sí mismo');
```
Además: prueba que **cada** tabla con columna `alumno_id` tiene RLS habilitada:
```sql
SELECT is_empty($$ SELECT c.relname FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid
  WHERE a.attname='alumno_id' AND c.relkind='r' AND NOT c.relrowsecurity $$, 'todas con RLS');
```

## 6. P-DB-05 / 06 · Restricciones
- `INSERT asignacion_alumno(nivel_inicial=0)` y `=6` → `throws_ok` (23514).
- Segunda asignación de la misma actividad al mismo alumno → 23505.
- `actividad(destino='grupo', grupo_id=NULL)` → 23514.
- `intento_ejercicio` con `asignacion_id` y `practica_id` ambos nulos o ambos presentes → 23514.

## 7. P-DB-07 / 08
- Purga: eventos de hace 181 días se borran; de hace 179 se conservan.
- Anonimización: tras `fn_anonimizar_alumno`, `nombre` = 'Alumno anonimizado', `pin_hash` nulo, sin `nota_docente` ni `evento_emocional`; los intentos se conservan (agregados).
- Vistas contra `test_fixture.sql` con valores esperados exactos (p. ej. `indice_error` de Resta/Con préstamo en grupo 3A = 0.42).
- Esquema: `is_empty($$ SELECT column_name FROM information_schema.columns WHERE data_type='bytea' $$)` → ninguna columna binaria (RC-05).
