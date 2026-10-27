-- 0006 · Respuestas del diagnóstico matemático pregunta por pregunta (EXP-02.2, EXP-02.5).
-- Permite retomar donde se quedó y calificar en servidor: la pregunta guardada incluye la
-- respuesta correcta, que nunca se envía al navegador. Sin datos personales en `pregunta`.

CREATE TABLE diagnostico_mat_respuesta (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id      uuid NOT NULL REFERENCES sesion_alumno(id) ON DELETE CASCADE,
  alumno_id      uuid NOT NULL REFERENCES alumno(id) ON DELETE CASCADE,
  tema_id        uuid NOT NULL REFERENCES tema(id),
  orden          smallint NOT NULL CHECK (orden BETWEEN 1 AND 5),
  nivel          smallint NOT NULL CHECK (nivel BETWEEN 1 AND 5),
  pregunta       jsonb NOT NULL,
  respuesta      text,
  correcta       boolean,
  tiempo_ms      int CHECK (tiempo_ms >= 0),
  presentada_en  timestamptz NOT NULL DEFAULT now(),
  respondida_en  timestamptz,
  UNIQUE (sesion_id, tema_id, orden),
  CHECK ((respuesta IS NULL) = (correcta IS NULL) AND (respuesta IS NULL) = (respondida_en IS NULL))
);
-- A lo sumo una pregunta presentada sin responder por sesión
CREATE UNIQUE INDEX diag_respuesta_pendiente_uidx ON diagnostico_mat_respuesta (sesion_id) WHERE respuesta IS NULL;

ALTER TABLE diagnostico_mat_respuesta ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON diagnostico_mat_respuesta TO numotion_app;
GRANT UPDATE (respuesta, correcta, tiempo_ms, respondida_en) ON diagnostico_mat_respuesta TO numotion_app;
CREATE POLICY diag_resp_docente ON diagnostico_mat_respuesta FOR SELECT USING (es_docente() AND docente_puede_ver(alumno_id));
CREATE POLICY diag_resp_self ON diagnostico_mat_respuesta FOR ALL
  USING (es_alumno() AND alumno_id = app_user()) WITH CHECK (es_alumno() AND alumno_id = app_user());
