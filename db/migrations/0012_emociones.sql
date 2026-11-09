-- 0012 · Detección emocional y alertas tempranas (EXP-05: RI-02, RI-06, RNF-03, RC-04, RC-05, RF-16, RF-27).
-- Ninguna tabla guarda imágenes: de cada fotograma solo queda la emoción, la confianza y el estado derivado.
--
-- · asignacion_alumno.if_consecutivos / ultimo_if: evaluaciones seguidas con IF ≥ umbral (alerta a la 2.ª).
-- · uso_rekognition: tope por alumno (1 fotograma cada N s y M al día) en BD, no en memoria, para que
--   funcione con varias instancias serverless (RC-04, hallazgo §8.3 de estado-actual).
-- · Catálogo de guías de actuación (RF-27), contenido PROVISIONAL hasta validarlo (T-01-05).

ALTER TABLE asignacion_alumno
  ADD COLUMN if_consecutivos smallint NOT NULL DEFAULT 0 CHECK (if_consecutivos >= 0),
  ADD COLUMN ultimo_if numeric(3,2) CHECK (ultimo_if BETWEEN 0 AND 1);
GRANT UPDATE (if_consecutivos, ultimo_if) ON asignacion_alumno TO numotion_app;

CREATE TABLE uso_rekognition (
  alumno_id  uuid NOT NULL REFERENCES alumno(id) ON DELETE CASCADE,
  fecha      date NOT NULL,
  llamadas   int NOT NULL DEFAULT 0 CHECK (llamadas >= 0),
  ultima_en  timestamptz,
  PRIMARY KEY (alumno_id, fecha)
);
ALTER TABLE uso_rekognition ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON uso_rekognition FROM PUBLIC, numotion_app;

-- 'ok' (y cuenta la llamada), 'frecuencia' (antes de p_intervalo_seg) o 'tope' (p_tope del día alcanzado).
-- Bloqueo de fila: dos fotogramas simultáneos del mismo alumno no pasan ambos.
CREATE FUNCTION fn_rekognition_reservar(p_intervalo_seg int, p_tope int) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoy date := fn_hoy_local(); u uso_rekognition%ROWTYPE;
BEGIN
  IF NOT es_alumno() THEN RAISE EXCEPTION 'Solo en contexto de alumno' USING ERRCODE = '42501'; END IF;
  INSERT INTO uso_rekognition (alumno_id, fecha) VALUES (app_user(), v_hoy) ON CONFLICT DO NOTHING;
  SELECT * INTO u FROM uso_rekognition WHERE alumno_id = app_user() AND fecha = v_hoy FOR UPDATE;
  IF u.ultima_en IS NOT NULL AND u.ultima_en > now() - make_interval(secs => p_intervalo_seg) THEN RETURN 'frecuencia'; END IF;
  IF u.llamadas >= p_tope THEN RETURN 'tope'; END IF;
  UPDATE uso_rekognition SET llamadas = llamadas + 1, ultima_en = now() WHERE alumno_id = app_user() AND fecha = v_hoy;
  RETURN 'ok';
END $$;
GRANT EXECUTE ON FUNCTION fn_rekognition_reservar(int, int) TO numotion_app;

-- Métrica rekognition_calls_total del día (para el docente/operación, sin datos por alumno)
CREATE FUNCTION fn_rekognition_llamadas_hoy() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(llamadas), 0) FROM uso_rekognition WHERE fecha = fn_hoy_local() $$;
REVOKE EXECUTE ON FUNCTION fn_rekognition_llamadas_hoy() FROM PUBLIC, numotion_app;

-- ───────────── Guías de actuación (RF-27) ─────────────
CREATE UNIQUE INDEX IF NOT EXISTS guia_actuacion_estado_titulo_uidx ON guia_actuacion (estado, titulo);
INSERT INTO guia_actuacion (estado, titulo, pasos, mensaje_alumno) VALUES
  ('frustracion', 'Señales de frustración durante el ejercicio',
   '[{"orden":1,"texto":"Acércate con calma y pregúntale cómo va, sin señalar el error."},
     {"orden":2,"texto":"Reconoce el esfuerzo antes de corregir: «Veo que lo estás intentando»."},
     {"orden":3,"texto":"Resuelvan juntos solo el primer paso del ejercicio y deja que termine."},
     {"orden":4,"texto":"Si persiste, propón una pausa activa de 1 minuto (estirarse, respirar)."},
     {"orden":5,"texto":"Registra una nota rápida si notas un patrón con este tema."}]',
   '¿Quieres que te ayude? Vamos paso a paso.'),
  ('desinteres', 'Señales de desinterés o distracción',
   '[{"orden":1,"texto":"Acércate y pregúntale qué le está pareciendo la actividad."},
     {"orden":2,"texto":"Relaciona el ejercicio con algo que le guste (sus intereses)."},
     {"orden":3,"texto":"Propón un reto corto con una meta clara: «Resuelve 2 y descansamos»."},
     {"orden":4,"texto":"Si continúa, ofrece cambiar a un juego de práctica libre del mismo tema."}]',
   '¿Te ayudo a seguir? ¡Tú puedes!')
ON CONFLICT (estado, titulo) DO NOTHING;

-- Parámetros del muestreo (EXP-05.1, EXP-05.2); se pueden sobrescribir con variables de entorno
INSERT INTO config_adaptativa (clave, valor) VALUES
  ('rekognition_intervalo_seg', '5'),
  ('rekognition_tope_diario', '400'),
  ('muestreo_camara_seg', '10')
ON CONFLICT (clave) DO NOTHING;
