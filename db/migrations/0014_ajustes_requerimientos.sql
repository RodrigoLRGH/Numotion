-- Ajustes a la matriz de requerimientos actualizada (2026-11-26).

-- ───────────── RF-11 + RF-72: avance de la asignación ─────────────
-- RF-11: un ejercicio de actividad admite como máximo 3 intentos; al 3.er fallo se cierra.
-- RF-72: la asignación pasa a "en curso" al completarse su primer ejercicio (acierto o intentos
-- agotados), no con el primer intento; iniciada_en sí marca el primer intento.
CREATE OR REPLACE FUNCTION fn_intento_actualiza_asignacion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a asignacion_alumno%ROWTYPE; cerrado boolean; total smallint; correctos int;
BEGIN
  IF NEW.asignacion_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO a FROM asignacion_alumno WHERE id = NEW.asignacion_id FOR UPDATE;
  IF a.alumno_id <> NEW.alumno_id THEN RAISE EXCEPTION 'ASIGNACION_AJENA'; END IF;
  IF a.estado = 'completada' THEN RAISE EXCEPTION 'ASIGNACION_COMPLETADA'; END IF;
  a.iniciada_en := coalesce(a.iniciada_en, now());
  cerrado := NEW.correcta OR NEW.numero_intento >= 3;
  IF cerrado THEN
    a.ejercicios_resueltos := a.ejercicios_resueltos + 1;
    IF a.estado = 'pendiente' THEN a.estado := 'en_curso'; END IF;
  END IF;
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

-- ───────────── RF-27: solo la guía de actuación del desinterés ─────────────
UPDATE alerta SET guia_id = NULL
 WHERE guia_id IN (SELECT id FROM guia_actuacion WHERE estado <> 'desinteres');
DELETE FROM guia_actuacion WHERE estado <> 'desinteres';

-- ───────────── RF-22: mensajes según el historial académico ─────────────
-- Condiciones evaluadas por elegirMensaje (packages/core/src/dominio/mensajes.ts). Marcadores:
-- {actividades}, {resultado} y {tema} (última actividad completada), {tema_fuerte} y {tema_reto}
-- (dominio ≥ 4 y ≤ 2 en el diagnóstico más reciente).
INSERT INTO mensaje_motivacional (texto, condicion) VALUES
  ('¡Bienvenido, {nombre}! Tu primera actividad te está esperando 🎯', '{"actividadesMax":0}'),
  ('¡{nombre}, ya completaste {actividades} actividades! Vas muy bien 📚', '{"actividadesMin":3}'),
  ('¡Muy bien en {tema}, {nombre}! Sacaste {resultado}. ¿Vamos por más? ⭐', '{"resultadoMin":8}'),
  ('{nombre}, en {tema} cada intento cuenta. ¡Hoy lo harás todavía mejor! 💪', '{"resultadoMax":5.99}'),
  ('{nombre}, ¡se te da muy bien {tema_fuerte}! Hoy sigue brillando ✨', '{"conTemaFuerte":true}'),
  ('{nombre}, hoy podemos practicar {tema_reto} con calma, paso a paso 🧩', '{"conTemaReto":true}')
ON CONFLICT (texto) DO NOTHING;
