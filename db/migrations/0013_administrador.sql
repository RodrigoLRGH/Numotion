-- 0013 · Rol administrador que atiende las solicitudes ARCO y las revocaciones (RC-07, RC-08, RNF-10,
-- 03-seguridad §6.5). No hay autorregistro: las cuentas se crean con `npm run admin:crear`.
-- Todo pasa por funciones SECURITY DEFINER que exigen app.role = 'admin'; la app no lee la tabla.

CREATE TABLE administrador (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre            text NOT NULL CHECK (length(nombre) BETWEEN 3 AND 120),
  email             citext NOT NULL UNIQUE,
  password_hash     text NOT NULL,
  activo            boolean NOT NULL DEFAULT true,
  intentos_fallidos int NOT NULL DEFAULT 0,
  bloqueado_hasta   timestamptz,
  creado_en         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE administrador ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON administrador FROM PUBLIC, numotion_app;

-- Resolución de la solicitud: qué se respondió al tutor y quién la atendió
ALTER TABLE solicitud_arco
  ADD COLUMN respuesta     text CHECK (length(respuesta) <= 2000),
  ADD COLUMN atendida_por  uuid REFERENCES administrador(id);

-- Fecha límite: n días hábiles después de p_desde (lun–vie sin dia_inhabil)
CREATE FUNCTION fn_sumar_dias_habiles(p_desde date, p_dias int) RETURNS date LANGUAGE sql STABLE AS $$
  SELECT g.d::date FROM generate_series((p_desde + 1)::timestamp, (p_desde + p_dias * 3 + 60)::timestamp, interval '1 day') g(d)
   WHERE fn_es_dia_habil(g.d::date) ORDER BY g.d OFFSET p_dias - 1 LIMIT 1 $$;

-- ───────────── Autenticación ─────────────

CREATE FUNCTION fn_auth_admin(p_email citext)
RETURNS TABLE(id uuid, nombre text, password_hash text, activo boolean, bloqueado_hasta timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.nombre, a.password_hash, a.activo, a.bloqueado_hasta FROM administrador a WHERE a.email = p_email $$;

-- Bloqueo 15 min tras 10 fallos, igual que el docente (03-seguridad §1)
CREATE FUNCTION fn_auth_admin_resultado(p_admin uuid, p_exito boolean, p_ip inet) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_exito THEN
    UPDATE administrador SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = p_admin;
    PERFORM fn_auditar(p_admin, 'admin', 'login', NULL, NULL, p_ip);
  ELSE
    UPDATE administrador SET intentos_fallidos = intentos_fallidos + 1,
           bloqueado_hasta = CASE WHEN intentos_fallidos + 1 >= 10 THEN now() + interval '15 minutes' END
     WHERE id = p_admin;
    UPDATE administrador SET intentos_fallidos = 0 WHERE id = p_admin AND bloqueado_hasta IS NOT NULL;
    PERFORM fn_auditar(p_admin, 'admin', 'login_fallido', NULL, NULL, p_ip);
  END IF;
END $$;

-- La sesión ahora también resuelve administradores
CREATE OR REPLACE FUNCTION fn_sesion_auth(p_token_hash text)
RETURNS TABLE(rol rol_usuario, usuario_id uuid, nombre text, grupo_id uuid, acepta_camara boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.rol, s.usuario_id, d.nombre, NULL::uuid, false
    FROM sesion_auth s JOIN docente d ON d.id = s.usuario_id
   WHERE s.token_hash = p_token_hash AND s.rol = 'docente' AND s.expira_en > now() AND d.activo
  UNION ALL
  SELECT s.rol, s.usuario_id, a.nombre, a.grupo_id, c.acepta_camara
    FROM sesion_auth s JOIN alumno a ON a.id = s.usuario_id
    CROSS JOIN LATERAL fn_consentimiento_vigente(a.id) c
   WHERE s.token_hash = p_token_hash AND s.rol = 'alumno' AND s.expira_en > now() AND a.activo AND c.vigente
  UNION ALL
  SELECT s.rol, s.usuario_id, ad.nombre, NULL::uuid, false
    FROM sesion_auth s JOIN administrador ad ON ad.id = s.usuario_id
   WHERE s.token_hash = p_token_hash AND s.rol = 'admin' AND s.expira_en > now() AND ad.activo $$;

-- ───────────── Solicitudes ARCO ─────────────

-- Bandeja del administrador: pendientes primero (las más antiguas arriba), con su fecha límite
CREATE FUNCTION fn_admin_solicitudes_arco(p_solo_pendientes boolean)
RETURNS TABLE(id uuid, tipo tipo_arco, detalle text, creada_en timestamptz, limite date, atendida_en timestamptz,
              respuesta text, atendida_por text, alumno_id uuid, alumno text, anonimizado boolean, grupo text,
              docente text, tutor_nombre text, tutor_email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF app_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'PROHIBIDO'; END IF;
  RETURN QUERY
  SELECT s.id, s.tipo, s.detalle, s.creada_en,
         fn_sumar_dias_habiles((s.creada_en AT TIME ZONE 'America/Tijuana')::date, 20),
         s.atendida_en, s.respuesta, ad.nombre, a.id, trim(a.nombre || ' ' || coalesce(a.apellidos, '')),
         a.nombre = 'Alumno anonimizado', g.nombre, d.nombre, c.tutor_nombre, c.tutor_email::text
    FROM solicitud_arco s
    JOIN alumno a ON a.id = s.alumno_id
    JOIN grupo g ON g.id = a.grupo_id
    JOIN docente d ON d.id = g.docente_id
    JOIN consentimiento_tutor c ON c.id = s.consentimiento_id
    LEFT JOIN administrador ad ON ad.id = s.atendida_por
   WHERE NOT p_solo_pendientes OR s.atendida_en IS NULL
   ORDER BY s.atendida_en IS NOT NULL, s.creada_en;
END $$;

-- Atiende una solicitud. Con p_anonimizar (cancelación, oposición o revocación) borra la PII del
-- alumno con fn_anonimizar_alumno. Devuelve el correo del tutor leído ANTES de anonimizar, para
-- que la app le envíe la respuesta.
-- resultado: 'ok' | 'no_encontrada' | 'ya_atendida' | 'anonimizar_no_aplica'
CREATE FUNCTION fn_admin_atender_arco(p_solicitud uuid, p_respuesta text, p_anonimizar boolean, p_ip inet)
RETURNS TABLE(resultado text, tutor_email text, tutor_nombre text, alumno text, tipo tipo_arco)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE s solicitud_arco%ROWTYPE; c consentimiento_tutor%ROWTYPE; v_alumno text;
BEGIN
  IF app_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'PROHIBIDO'; END IF;
  SELECT * INTO s FROM solicitud_arco WHERE solicitud_arco.id = p_solicitud FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'no_encontrada'::text, NULL::text, NULL::text, NULL::text, NULL::tipo_arco; RETURN;
  END IF;
  IF s.atendida_en IS NOT NULL THEN
    RETURN QUERY SELECT 'ya_atendida'::text, NULL::text, NULL::text, NULL::text, s.tipo; RETURN;
  END IF;
  IF p_anonimizar AND s.tipo NOT IN ('cancelacion', 'oposicion', 'revocacion') THEN
    RETURN QUERY SELECT 'anonimizar_no_aplica'::text, NULL::text, NULL::text, NULL::text, s.tipo; RETURN;
  END IF;
  SELECT * INTO c FROM consentimiento_tutor WHERE consentimiento_tutor.id = s.consentimiento_id;
  SELECT split_part(a.nombre, ' ', 1) INTO v_alumno FROM alumno a WHERE a.id = s.alumno_id;
  IF p_anonimizar THEN PERFORM fn_anonimizar_alumno(s.alumno_id); END IF;
  UPDATE solicitud_arco SET atendida_en = now(), respuesta = p_respuesta, atendida_por = app_user()
   WHERE solicitud_arco.id = s.id;
  PERFORM fn_auditar(app_user(), 'admin', 'arco', 'solicitud_arco', s.id::text, p_ip);
  RETURN QUERY SELECT 'ok'::text, c.tutor_email::text, c.tutor_nombre, v_alumno, s.tipo;
END $$;
