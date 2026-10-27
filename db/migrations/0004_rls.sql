-- 0004 · Roles, permisos y Row Level Security (T-02-06). Fuente: 02-diseno/diseno/03-seguridad-rls-resumen.md §4
-- La app usa numotion_app (sin BYPASSRLS). Cada transacción fija app.user_id y app.role.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'numotion_app') THEN
    CREATE ROLE numotion_app LOGIN NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO numotion_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO numotion_app;

-- ¿El docente en contexto es dueño del grupo del alumno?
CREATE FUNCTION docente_puede_ver(p_alumno uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM alumno a JOIN grupo g ON g.id = a.grupo_id
                 WHERE a.id = p_alumno AND g.docente_id = app_user()) $$;

CREATE FUNCTION es_docente() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT app_role() = 'docente' $$;
CREATE FUNCTION es_alumno() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT app_role() = 'alumno' $$;

-- Auxiliares SECURITY DEFINER: evitan recursión entre políticas que se consultan entre sí
CREATE FUNCTION docente_es_dueno_grupo(p_grupo uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM grupo g WHERE g.id = p_grupo AND g.docente_id = app_user()) $$;
CREATE FUNCTION grupo_del_alumno() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.grupo_id FROM alumno a WHERE a.id = app_user() $$;
CREATE FUNCTION docente_del_alumno() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.docente_id FROM alumno a JOIN grupo g ON g.id = a.grupo_id WHERE a.id = app_user() $$;
CREATE FUNCTION docente_es_dueno_actividad(p_actividad uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM actividad ac WHERE ac.id = p_actividad AND ac.docente_id = app_user()) $$;
CREATE FUNCTION alumno_tiene_actividad(p_actividad uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM asignacion_alumno s WHERE s.actividad_id = p_actividad AND s.alumno_id = app_user()) $$;
CREATE FUNCTION alumno_tiene_asignacion(p_asignacion uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM asignacion_alumno s WHERE s.id = p_asignacion AND s.alumno_id = app_user()) $$;

GRANT EXECUTE ON FUNCTION docente_puede_ver(uuid), es_docente(), es_alumno(), docente_es_dueno_grupo(uuid),
  grupo_del_alumno(), docente_del_alumno(), docente_es_dueno_actividad(uuid), alumno_tiene_actividad(uuid),
  alumno_tiene_asignacion(uuid) TO numotion_app;

-- Las funciones administrativas no se exponen a la app
REVOKE EXECUTE ON FUNCTION fn_purgar_eventos_emocionales() FROM PUBLIC, numotion_app;

-- ───────────── Catálogos: solo lectura ─────────────
GRANT SELECT ON tema, subtema, pregunta_diagnostico, panas_item, guia_actuacion, config_adaptativa,
                dia_inhabil, insignia, mensaje_motivacional, aviso_privacidad TO numotion_app;

-- ejercicio: lectura de catálogo; inserción de ejercicios generados (generador/OpenAI)
ALTER TABLE ejercicio ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON ejercicio TO numotion_app;
CREATE POLICY ejercicio_leer ON ejercicio FOR SELECT USING (app_role() IS NOT NULL);
CREATE POLICY ejercicio_generar ON ejercicio FOR INSERT WITH CHECK (es_alumno() AND origen <> 'catalogo');

-- ───────────── docente ─────────────
ALTER TABLE docente ENABLE ROW LEVEL SECURITY;
GRANT SELECT (id, nombre, email, activo, creado_en) ON docente TO numotion_app;
GRANT UPDATE (nombre) ON docente TO numotion_app;
CREATE POLICY docente_self ON docente FOR SELECT USING (es_docente() AND id = app_user());
CREATE POLICY docente_self_upd ON docente FOR UPDATE USING (es_docente() AND id = app_user());

-- ───────────── grupo ─────────────
ALTER TABLE grupo ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON grupo TO numotion_app;
CREATE POLICY grupo_docente ON grupo FOR ALL
  USING (es_docente() AND docente_id = app_user()) WITH CHECK (es_docente() AND docente_id = app_user());
CREATE POLICY grupo_alumno ON grupo FOR SELECT
  USING (es_alumno() AND id = grupo_del_alumno());

-- ───────────── alumno (pin_hash y bloqueo no son legibles) ─────────────
ALTER TABLE alumno ENABLE ROW LEVEL SECURITY;
GRANT SELECT (id, grupo_id, nombre, apellidos, avatar, intereses, activo, creado_en) ON alumno TO numotion_app;
GRANT INSERT (grupo_id, nombre, apellidos, avatar, pin_hash, intereses) ON alumno TO numotion_app;
GRANT UPDATE (nombre, apellidos, avatar, pin_hash, intereses, activo, intentos_fallidos, bloqueado_hasta)
  ON alumno TO numotion_app;
-- Por grupo_id (no docente_puede_ver(id)): la fila recién insertada aún no es visible para la función STABLE
CREATE POLICY alumno_docente ON alumno FOR SELECT USING (es_docente() AND docente_es_dueno_grupo(grupo_id));
CREATE POLICY alumno_docente_ins ON alumno FOR INSERT
  WITH CHECK (es_docente() AND docente_es_dueno_grupo(grupo_id));
CREATE POLICY alumno_docente_upd ON alumno FOR UPDATE
  USING (es_docente() AND docente_es_dueno_grupo(grupo_id))
  WITH CHECK (es_docente() AND docente_es_dueno_grupo(grupo_id));
CREATE POLICY alumno_self ON alumno FOR SELECT USING (es_alumno() AND id = app_user());

-- ───────────── consentimiento_tutor: el docente lo crea y ve el estado; el tutor opera por funciones ─────────────
ALTER TABLE consentimiento_tutor ENABLE ROW LEVEL SECURITY;
GRANT SELECT (id, alumno_id, tutor_nombre, tutor_email, parentesco, version_aviso, acepta_plataforma,
              acepta_camara, aceptado_en, revocado_en, token_expira_en, creado_en) ON consentimiento_tutor TO numotion_app;
GRANT INSERT (alumno_id, tutor_nombre, tutor_email, parentesco, version_aviso, token_hash, token_expira_en)
  ON consentimiento_tutor TO numotion_app;
CREATE POLICY consentimiento_docente ON consentimiento_tutor FOR SELECT USING (es_docente() AND docente_puede_ver(alumno_id));
CREATE POLICY consentimiento_docente_ins ON consentimiento_tutor FOR INSERT
  WITH CHECK (es_docente() AND docente_puede_ver(alumno_id));

-- ───────────── Tablas propias del alumno: lectura del docente, lectura/escritura propia ─────────────
-- sesion_alumno, panas_resultado, diagnostico_mat_resultado, retroalimentacion, intento_ejercicio, practica_libre
ALTER TABLE sesion_alumno ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON sesion_alumno TO numotion_app;
CREATE POLICY sesion_docente ON sesion_alumno FOR SELECT USING (es_docente() AND docente_puede_ver(alumno_id));
CREATE POLICY sesion_self ON sesion_alumno FOR ALL
  USING (es_alumno() AND alumno_id = app_user()) WITH CHECK (es_alumno() AND alumno_id = app_user());

ALTER TABLE panas_resultado ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON panas_resultado TO numotion_app;
CREATE POLICY panas_docente ON panas_resultado FOR SELECT USING (es_docente() AND docente_puede_ver(alumno_id));
CREATE POLICY panas_self ON panas_resultado FOR ALL
  USING (es_alumno() AND alumno_id = app_user()) WITH CHECK (es_alumno() AND alumno_id = app_user());

ALTER TABLE diagnostico_mat_resultado ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON diagnostico_mat_resultado TO numotion_app;
CREATE POLICY diag_docente ON diagnostico_mat_resultado FOR SELECT USING (es_docente() AND docente_puede_ver(alumno_id));
CREATE POLICY diag_self_sel ON diagnostico_mat_resultado FOR SELECT USING (es_alumno() AND alumno_id = app_user());
CREATE POLICY diag_self_ins ON diagnostico_mat_resultado FOR INSERT WITH CHECK (es_alumno() AND alumno_id = app_user());

ALTER TABLE retroalimentacion ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON retroalimentacion TO numotion_app;   -- se escribe con fn_generar_retroalimentacion
CREATE POLICY retro_docente ON retroalimentacion FOR SELECT USING (es_docente() AND docente_puede_ver(alumno_id));
CREATE POLICY retro_self ON retroalimentacion FOR SELECT USING (es_alumno() AND alumno_id = app_user());

ALTER TABLE intento_ejercicio ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON intento_ejercicio TO numotion_app;
CREATE POLICY intento_docente ON intento_ejercicio FOR SELECT USING (es_docente() AND docente_puede_ver(alumno_id));
CREATE POLICY intento_self_sel ON intento_ejercicio FOR SELECT USING (es_alumno() AND alumno_id = app_user());
CREATE POLICY intento_self_ins ON intento_ejercicio FOR INSERT WITH CHECK (es_alumno() AND alumno_id = app_user());

ALTER TABLE practica_libre ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON practica_libre TO numotion_app;
CREATE POLICY practica_docente ON practica_libre FOR SELECT USING (es_docente() AND docente_puede_ver(alumno_id));
CREATE POLICY practica_self ON practica_libre FOR ALL
  USING (es_alumno() AND alumno_id = app_user()) WITH CHECK (es_alumno() AND alumno_id = app_user());

-- ───────────── evento_emocional: el alumno solo inserta, nunca lee (RF-65) ─────────────
ALTER TABLE evento_emocional ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON evento_emocional TO numotion_app;
CREATE POLICY evento_docente ON evento_emocional FOR SELECT USING (es_docente() AND docente_puede_ver(alumno_id));
CREATE POLICY evento_self_ins ON evento_emocional FOR INSERT WITH CHECK (es_alumno() AND alumno_id = app_user());

-- ───────────── Actividades y asignaciones ─────────────
ALTER TABLE actividad ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE, DELETE ON actividad TO numotion_app;   -- alta con fn_registrar_asignacion
CREATE POLICY actividad_docente ON actividad FOR ALL
  USING (es_docente() AND docente_id = app_user()) WITH CHECK (es_docente() AND docente_id = app_user());
CREATE POLICY actividad_alumno ON actividad FOR SELECT
  USING (es_alumno() AND alumno_tiene_actividad(id));

ALTER TABLE asignacion_alumno ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON asignacion_alumno TO numotion_app;
GRANT UPDATE (nivel_actual, puntaje) ON asignacion_alumno TO numotion_app;
CREATE POLICY asignacion_docente ON asignacion_alumno FOR SELECT
  USING (es_docente() AND docente_es_dueno_actividad(actividad_id));
CREATE POLICY asignacion_self ON asignacion_alumno FOR SELECT USING (es_alumno() AND alumno_id = app_user());
CREATE POLICY asignacion_self_upd ON asignacion_alumno FOR UPDATE
  USING (es_alumno() AND alumno_id = app_user()) WITH CHECK (es_alumno() AND alumno_id = app_user());

ALTER TABLE ajuste_dificultad ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON ajuste_dificultad TO numotion_app;
CREATE POLICY ajuste_docente ON ajuste_dificultad FOR SELECT USING (es_docente() AND docente_puede_ver(alumno_id));
CREATE POLICY ajuste_self ON ajuste_dificultad FOR ALL
  USING (es_alumno() AND alumno_id = app_user())
  WITH CHECK (es_alumno() AND alumno_id = app_user()
              AND alumno_tiene_asignacion(asignacion_id));

-- ───────────── Alertas ─────────────
ALTER TABLE alerta ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON alerta TO numotion_app;
GRANT UPDATE (alumno_acepto_ayuda, atendida_en, atendida_por) ON alerta TO numotion_app;
CREATE POLICY alerta_docente ON alerta FOR SELECT USING (es_docente() AND docente_id = app_user());
CREATE POLICY alerta_docente_upd ON alerta FOR UPDATE
  USING (es_docente() AND docente_id = app_user()) WITH CHECK (es_docente() AND docente_id = app_user());
-- El alumno genera la alerta para el docente de su grupo y solo responde si acepta ayuda
CREATE POLICY alerta_self_ins ON alerta FOR INSERT
  WITH CHECK (es_alumno() AND alumno_id = app_user()
              AND docente_id = docente_del_alumno());
CREATE POLICY alerta_self_sel ON alerta FOR SELECT USING (es_alumno() AND alumno_id = app_user());
CREATE POLICY alerta_self_upd ON alerta FOR UPDATE
  USING (es_alumno() AND alumno_id = app_user()) WITH CHECK (es_alumno() AND alumno_id = app_user());

-- ───────────── Gamificación ─────────────
ALTER TABLE perfil_gamificacion ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON perfil_gamificacion TO numotion_app;
CREATE POLICY perfil_docente ON perfil_gamificacion FOR SELECT USING (es_docente() AND docente_puede_ver(alumno_id));
CREATE POLICY perfil_self ON perfil_gamificacion FOR ALL
  USING (es_alumno() AND alumno_id = app_user()) WITH CHECK (es_alumno() AND alumno_id = app_user());

ALTER TABLE alumno_insignia ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON alumno_insignia TO numotion_app;
CREATE POLICY insignia_docente ON alumno_insignia FOR SELECT USING (es_docente() AND docente_puede_ver(alumno_id));
CREATE POLICY insignia_self ON alumno_insignia FOR ALL
  USING (es_alumno() AND alumno_id = app_user()) WITH CHECK (es_alumno() AND alumno_id = app_user());

ALTER TABLE racha_alumno ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON racha_alumno TO numotion_app;        -- se escribe con trg_practica_racha
CREATE POLICY racha_docente ON racha_alumno FOR SELECT USING (es_docente() AND docente_puede_ver(alumno_id));
CREATE POLICY racha_self ON racha_alumno FOR SELECT USING (es_alumno() AND alumno_id = app_user());

-- ───────────── Docente: notas y resultados (el alumno no tiene acceso) ─────────────
ALTER TABLE nota_docente ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON nota_docente TO numotion_app;
CREATE POLICY nota_docente_all ON nota_docente FOR ALL
  USING (es_docente() AND docente_puede_ver(alumno_id))
  WITH CHECK (es_docente() AND docente_id = app_user() AND docente_puede_ver(alumno_id));

ALTER TABLE resultado_academico ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON resultado_academico TO numotion_app;
CREATE POLICY resultado_docente ON resultado_academico FOR ALL
  USING (es_docente() AND docente_puede_ver(alumno_id))
  WITH CHECK (es_docente() AND docente_puede_ver(alumno_id) AND tipo <> 'actividad_numotion');

-- ───────────── Sin acceso directo ─────────────
-- sesion_auth y auditoria_acceso solo mediante funciones SECURITY DEFINER.
ALTER TABLE sesion_auth ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_acceso ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sesion_auth, auditoria_acceso FROM PUBLIC, numotion_app;

-- Funciones creadas después de este archivo deben otorgarse explícitamente.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO numotion_app;
