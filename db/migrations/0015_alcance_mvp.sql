-- 0015 · Alcance del MVP (2026-11-26). Decisiones del equipo:
-- · RC-07 queda fuera del MVP: sin administrador ni solicitudes ARCO, sin auditoría de accesos y sin
--   purga de eventos emocionales. La cámara queda activa para todos los alumnos (RC-03, RI-02); la
--   imagen sigue sin guardarse (RNF-03).
-- · El consentimiento del tutor y el aviso de privacidad (RC-08, RNF-10) se conservan: aquí solo se
--   borran sus funciones, que dependían de la auditoría y de ARCO; 0016 las vuelve a crear sin ellas.
-- · Sin alertas al docente (RF-16 fuera de alcance): se borran las alertas y las guías de actuación.
--   Al alumno solo se le pregunta "¿Quieres que te ayude?"; su frecuencia la limita
--   asignacion_alumno.ultima_oferta_ayuda.
-- · Sin diagnóstico corto: el alumno hace el diagnóstico completo cada día.
-- ⚠ Destructiva: los datos de estas tablas se pierden. Respaldar antes (branch de Neon).

-- ───────────── Autenticación sin auditoría (0016 vuelve a exigir el consentimiento) ─────────────
DROP FUNCTION IF EXISTS fn_auth_alumno(uuid, uuid);
CREATE FUNCTION fn_auth_alumno(p_grupo uuid, p_alumno uuid)
RETURNS TABLE(id uuid, nombre text, avatar text, pin_hash text, bloqueado_hasta timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.nombre, a.avatar, a.pin_hash, a.bloqueado_hasta
    FROM alumno a
   WHERE a.id = p_alumno AND a.grupo_id = p_grupo AND a.activo $$;

DROP FUNCTION IF EXISTS fn_sesion_auth(text);
CREATE FUNCTION fn_sesion_auth(p_token_hash text)
RETURNS TABLE(rol rol_usuario, usuario_id uuid, nombre text, grupo_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.rol, s.usuario_id, d.nombre, NULL::uuid
    FROM sesion_auth s JOIN docente d ON d.id = s.usuario_id
   WHERE s.token_hash = p_token_hash AND s.rol = 'docente' AND s.expira_en > now() AND d.activo
  UNION ALL
  SELECT s.rol, s.usuario_id, a.nombre, a.grupo_id
    FROM sesion_auth s JOIN alumno a ON a.id = s.usuario_id
   WHERE s.token_hash = p_token_hash AND s.rol = 'alumno' AND s.expira_en > now() AND a.activo $$;

CREATE OR REPLACE FUNCTION fn_auth_docente_resultado(p_docente uuid, p_exito boolean, p_ip inet) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_exito THEN
    UPDATE docente SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = p_docente;
  ELSE
    UPDATE docente SET intentos_fallidos = intentos_fallidos + 1,
           bloqueado_hasta = CASE WHEN intentos_fallidos + 1 >= 10 THEN now() + interval '15 minutes' END
     WHERE id = p_docente;
    UPDATE docente SET intentos_fallidos = 0 WHERE id = p_docente AND bloqueado_hasta IS NOT NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION fn_auth_alumno_resultado(p_alumno uuid, p_exito boolean, p_ip inet) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sesion uuid;
BEGIN
  IF NOT p_exito THEN
    UPDATE alumno SET intentos_fallidos = intentos_fallidos + 1,
           bloqueado_hasta = CASE WHEN intentos_fallidos + 1 >= 5 THEN now() + interval '5 minutes' END
     WHERE id = p_alumno;
    UPDATE alumno SET intentos_fallidos = 0 WHERE id = p_alumno AND bloqueado_hasta IS NOT NULL;
    RETURN NULL;
  END IF;
  UPDATE alumno SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = p_alumno;
  INSERT INTO perfil_gamificacion(alumno_id) VALUES (p_alumno) ON CONFLICT DO NOTHING;
  INSERT INTO racha_alumno(alumno_id) VALUES (p_alumno) ON CONFLICT DO NOTHING;
  INSERT INTO sesion_alumno(alumno_id, fecha) VALUES (p_alumno, fn_hoy_local())
    ON CONFLICT (alumno_id, fecha) DO UPDATE SET ultima_actividad_en = now()
    RETURNING id INTO v_sesion;
  RETURN v_sesion;
END $$;

-- Sesiones de administrador que pudieran quedar
DELETE FROM sesion_auth WHERE rol = 'admin';

-- ───────────── Administrador y ARCO (RC-07) ─────────────
DROP FUNCTION IF EXISTS fn_admin_atender_arco(uuid, text, boolean, inet);
DROP FUNCTION IF EXISTS fn_admin_solicitudes_arco(boolean);
DROP FUNCTION IF EXISTS fn_auth_admin_resultado(uuid, boolean, inet);
DROP FUNCTION IF EXISTS fn_auth_admin(citext);
DROP FUNCTION IF EXISTS fn_sumar_dias_habiles(date, int);
DROP FUNCTION IF EXISTS fn_anonimizar_alumno(uuid);
DROP TABLE IF EXISTS solicitud_arco;
DROP TABLE IF EXISTS administrador;

-- ───────────── Funciones del consentimiento (dependían de ARCO y de la auditoría; ver 0016) ─────────────
DROP FUNCTION IF EXISTS fn_renovar_invitacion(uuid, text, timestamptz);
DROP FUNCTION IF EXISTS fn_consentimiento_arco(text, text, tipo_arco, text, inet);
DROP FUNCTION IF EXISTS fn_consentimiento_revocar(text, text, inet);
DO $$
DECLARE f regprocedure;
BEGIN
  -- Firmas largas (aceptar, por token, OTP…): se borran todas las fn_consentimiento_* y fn_aviso_vigente
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND (p.proname LIKE 'fn\_consentimiento\_%' OR p.proname = 'fn_aviso_vigente')
  LOOP
    EXECUTE format('DROP FUNCTION %s', f);
  END LOOP;
END $$;
DROP TYPE IF EXISTS tipo_arco;

-- ───────────── Auditoría de accesos (RC-07) ─────────────
DROP FUNCTION IF EXISTS fn_auditar(uuid, rol_usuario, accion_auditoria, text, text, inet);
DROP TABLE IF EXISTS auditoria_acceso;
DROP FUNCTION IF EXISTS fn_auditoria_inmutable();
DROP TYPE IF EXISTS accion_auditoria;

-- ───────────── Purga de eventos emocionales ─────────────
DROP FUNCTION IF EXISTS fn_purgar_eventos_emocionales();

-- ───────────── Alertas al docente y guías de actuación (RF-16, RF-27 del docente) ─────────────
DROP TABLE IF EXISTS alerta;
DROP TABLE IF EXISTS guia_actuacion;
DROP FUNCTION IF EXISTS docente_del_alumno();

-- La oferta de ayuda al alumno se limita con un enfriamiento por asignación
ALTER TABLE asignacion_alumno ADD COLUMN IF NOT EXISTS ultima_oferta_ayuda timestamptz;
GRANT UPDATE (ultima_oferta_ayuda) ON asignacion_alumno TO numotion_app;

-- ───────────── Diagnóstico completo cada día ─────────────
DELETE FROM config_adaptativa WHERE clave = 'diagnostico_corto_dias';
