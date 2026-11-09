-- 0009 · El alumno guarda en su intento la respuesta que le dio el servidor (idempotencia por cliente_id).
-- Solo esa columna: la respuesta, la corrección y los tiempos del intento siguen siendo inmutables.
GRANT UPDATE (resultado) ON intento_ejercicio TO numotion_app;
CREATE POLICY intento_self_upd ON intento_ejercicio FOR UPDATE
  USING (es_alumno() AND alumno_id = app_user()) WITH CHECK (es_alumno() AND alumno_id = app_user());
