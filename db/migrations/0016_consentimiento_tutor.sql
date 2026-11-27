-- 0016 · Consentimiento del tutor y aviso de privacidad de vuelta en el MVP (RC-08, RNF-10; 2026-11-27).
-- El alumno no entra sin el consentimiento verificable (enlace + código por correo) de su madre,
-- padre o tutor; revocarlo corta sus sesiones. Sin ARCO, administrador ni auditoría (RC-07 sigue
-- fuera del MVP, ver 0015). La cámara se usa con todos los alumnos (A-41): el tutor acepta la
-- plataforma, que incluye la detección emocional, y acepta_camara queda en true al aceptar.
-- Idempotente: si las tablas ya existen (producción) solo recrea las funciones; si una versión
-- anterior de 0015 las había borrado (bases de desarrollo), las vuelve a crear vacías.

-- ───────────── Tablas ─────────────
CREATE TABLE IF NOT EXISTS aviso_privacidad (
  version        text PRIMARY KEY,
  vigente_desde  timestamptz NOT NULL DEFAULT now(),
  url            text NOT NULL
);
INSERT INTO aviso_privacidad (version, vigente_desde, url) VALUES ('v1', '2026-01-01', '/privacidad')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS consentimiento_tutor (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id           uuid NOT NULL REFERENCES alumno(id) ON DELETE CASCADE,
  tutor_nombre        text NOT NULL,
  tutor_email         citext NOT NULL,
  parentesco          text,
  version_aviso       text NOT NULL REFERENCES aviso_privacidad(version),
  acepta_plataforma   boolean NOT NULL DEFAULT false,
  acepta_camara       boolean NOT NULL DEFAULT false,
  metodo_verificacion text NOT NULL DEFAULT 'email_otp',
  ip                  inet,
  aceptado_en         timestamptz,
  revocado_en         timestamptz,
  token_hash          text NOT NULL UNIQUE,
  token_expira_en     timestamptz NOT NULL,
  otp_hash            text,
  otp_expira_en       timestamptz,
  creado_en           timestamptz NOT NULL DEFAULT now(),
  otp_intentos        int NOT NULL DEFAULT 0,
  otp_enviado_en      timestamptz,
  CHECK (NOT acepta_camara OR acepta_plataforma)
);
CREATE UNIQUE INDEX IF NOT EXISTS consentimiento_vigente_uidx ON consentimiento_tutor (alumno_id)
  WHERE revocado_en IS NULL AND aceptado_en IS NOT NULL;

-- ───────────── RLS: el docente crea la invitación y ve el estado; el tutor opera por funciones ─────────────
GRANT SELECT ON aviso_privacidad TO numotion_app;
ALTER TABLE consentimiento_tutor ENABLE ROW LEVEL SECURITY;
GRANT SELECT (id, alumno_id, tutor_nombre, tutor_email, parentesco, version_aviso, acepta_plataforma,
              acepta_camara, aceptado_en, revocado_en, token_expira_en, creado_en) ON consentimiento_tutor TO numotion_app;
GRANT INSERT (alumno_id, tutor_nombre, tutor_email, parentesco, version_aviso, token_hash, token_expira_en)
  ON consentimiento_tutor TO numotion_app;
DROP POLICY IF EXISTS consentimiento_docente ON consentimiento_tutor;
CREATE POLICY consentimiento_docente ON consentimiento_tutor FOR SELECT USING (es_docente() AND docente_puede_ver(alumno_id));
DROP POLICY IF EXISTS consentimiento_docente_ins ON consentimiento_tutor;
CREATE POLICY consentimiento_docente_ins ON consentimiento_tutor FOR INSERT
  WITH CHECK (es_docente() AND docente_puede_ver(alumno_id));

-- ───────────── Funciones del consentimiento ─────────────
CREATE OR REPLACE FUNCTION fn_aviso_vigente() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT version FROM aviso_privacidad WHERE vigente_desde <= now() ORDER BY vigente_desde DESC LIMIT 1 $$;

-- Vigente: aceptado, no revocado, con plataforma y para la versión actual del aviso.
DROP FUNCTION IF EXISTS fn_consentimiento_vigente(uuid);
CREATE FUNCTION fn_consentimiento_vigente(p_alumno uuid)
RETURNS TABLE(vigente boolean, acepta_camara boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(c.id) > 0, coalesce(bool_or(c.acepta_camara), false)
    FROM consentimiento_tutor c
   WHERE c.alumno_id = p_alumno AND c.aceptado_en IS NOT NULL AND c.revocado_en IS NULL
     AND c.acepta_plataforma
     AND c.version_aviso = fn_aviso_vigente() $$;

-- Datos mínimos para la página del tutor: nombre de pila del alumno, grupo y docente (sin apellidos).
DROP FUNCTION IF EXISTS fn_consentimiento_por_token(text);
CREATE FUNCTION fn_consentimiento_por_token(p_token_hash text)
RETURNS TABLE(id uuid, alumno_nombre text, grupo text, docente text, tutor_nombre text, tutor_email text,
              parentesco text, version_aviso text, version_vigente text, aviso_url text, acepta_plataforma boolean,
              acepta_camara boolean, aceptado_en timestamptz, revocado_en timestamptz, token_expira_en timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, split_part(a.nombre, ' ', 1), g.nombre, d.nombre, c.tutor_nombre, c.tutor_email::text, c.parentesco,
         c.version_aviso, v.version, v.url, c.acepta_plataforma, c.acepta_camara, c.aceptado_en, c.revocado_en, c.token_expira_en
    FROM consentimiento_tutor c
    JOIN alumno a ON a.id = c.alumno_id AND a.activo
    JOIN grupo g ON g.id = a.grupo_id
    JOIN docente d ON d.id = g.docente_id
    LEFT JOIN aviso_privacidad v ON v.version = fn_aviso_vigente()
   WHERE c.token_hash = p_token_hash $$;

-- Registra un OTP nuevo (máx. 1 por minuto). Devuelve el correo al que hay que enviarlo.
-- resultado: 'ok' | 'token_invalido' | 'espera'
DROP FUNCTION IF EXISTS fn_consentimiento_nuevo_otp(text, text);
CREATE FUNCTION fn_consentimiento_nuevo_otp(p_token_hash text, p_otp_hash text)
RETURNS TABLE(resultado text, tutor_email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c consentimiento_tutor%ROWTYPE;
BEGIN
  SELECT * INTO c FROM consentimiento_tutor WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM alumno WHERE alumno.id = c.alumno_id AND activo) THEN
    RETURN QUERY SELECT 'token_invalido'::text, NULL::text; RETURN;
  END IF;
  IF c.otp_enviado_en > now() - interval '60 seconds' THEN
    RETURN QUERY SELECT 'espera'::text, NULL::text; RETURN;
  END IF;
  UPDATE consentimiento_tutor SET otp_hash = p_otp_hash, otp_expira_en = now() + interval '10 minutes',
         otp_intentos = 0, otp_enviado_en = now()
   WHERE consentimiento_tutor.id = c.id;
  RETURN QUERY SELECT 'ok'::text, c.tutor_email::text;
END $$;

-- Verifica y consume el OTP. 5 intentos por código. Uso interno de las funciones de abajo.
-- resultado: 'ok' | 'otp_invalido' | 'otp_vencido'
DROP FUNCTION IF EXISTS fn_consentimiento_usar_otp(uuid, text);
CREATE FUNCTION fn_consentimiento_usar_otp(p_id uuid, p_otp_hash text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c consentimiento_tutor%ROWTYPE;
BEGIN
  SELECT * INTO c FROM consentimiento_tutor WHERE id = p_id FOR UPDATE;
  IF c.otp_hash IS NULL OR c.otp_expira_en < now() OR c.otp_intentos >= 5 THEN RETURN 'otp_vencido'; END IF;
  IF c.otp_hash <> p_otp_hash THEN
    UPDATE consentimiento_tutor SET otp_intentos = otp_intentos + 1 WHERE id = p_id;
    RETURN 'otp_invalido';
  END IF;
  UPDATE consentimiento_tutor SET otp_hash = NULL, otp_expira_en = NULL, otp_intentos = 0 WHERE id = p_id;
  RETURN 'ok';
END $$;
REVOKE EXECUTE ON FUNCTION fn_consentimiento_usar_otp(uuid, text) FROM PUBLIC, numotion_app;

-- Acepta la plataforma (incluye la detección emocional con la cámara). El enlace vence a los 7 días (A-24).
-- resultado: 'ok' | 'token_invalido' | 'token_vencido' | 'revocado' | 'otp_invalido' | 'otp_vencido'
DROP FUNCTION IF EXISTS fn_consentimiento_aceptar(text, text, text, text, inet);
CREATE FUNCTION fn_consentimiento_aceptar(p_token_hash text, p_otp_hash text, p_tutor_nombre text,
                                          p_parentesco text, p_ip inet) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c consentimiento_tutor%ROWTYPE; r text;
BEGIN
  SELECT * INTO c FROM consentimiento_tutor WHERE token_hash = p_token_hash;
  IF NOT FOUND THEN RETURN 'token_invalido'; END IF;
  IF c.revocado_en IS NOT NULL THEN RETURN 'revocado'; END IF;
  -- Ya aceptado, el tutor puede volver a aceptar (p. ej. un aviso nuevo) aunque el enlace haya vencido
  IF c.aceptado_en IS NULL AND c.token_expira_en < now() THEN RETURN 'token_vencido'; END IF;
  r := fn_consentimiento_usar_otp(c.id, p_otp_hash);
  IF r <> 'ok' THEN RETURN r; END IF;
  UPDATE consentimiento_tutor
     SET tutor_nombre = p_tutor_nombre, parentesco = p_parentesco, acepta_plataforma = true,
         acepta_camara = true, version_aviso = fn_aviso_vigente(), aceptado_en = now(), ip = p_ip
   WHERE id = c.id;
  RETURN 'ok';
END $$;

-- Revoca: corta las sesiones del alumno; no vuelve a entrar sin un consentimiento nuevo.
DROP FUNCTION IF EXISTS fn_consentimiento_revocar(text, text, inet);
CREATE FUNCTION fn_consentimiento_revocar(p_token_hash text, p_otp_hash text, p_ip inet) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c consentimiento_tutor%ROWTYPE; r text;
BEGIN
  SELECT * INTO c FROM consentimiento_tutor WHERE token_hash = p_token_hash;
  IF NOT FOUND THEN RETURN 'token_invalido'; END IF;
  IF c.revocado_en IS NOT NULL THEN RETURN 'revocado'; END IF;
  r := fn_consentimiento_usar_otp(c.id, p_otp_hash);
  IF r <> 'ok' THEN RETURN r; END IF;
  UPDATE consentimiento_tutor SET revocado_en = now(), ip = p_ip WHERE id = c.id;
  DELETE FROM sesion_auth WHERE rol = 'alumno' AND usuario_id = c.alumno_id;
  RETURN 'ok';
END $$;

-- El docente genera un enlace nuevo (vencido, revocado o aviso por renovar).
-- Si el último consentimiento fue revocado se crea uno nuevo con los mismos datos del tutor.
DROP FUNCTION IF EXISTS fn_renovar_invitacion(uuid, text, timestamptz);
CREATE FUNCTION fn_renovar_invitacion(p_alumno uuid, p_token_hash text, p_expira timestamptz)
RETURNS TABLE(resultado text, tutor_email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c consentimiento_tutor%ROWTYPE;
BEGIN
  IF app_role() IS DISTINCT FROM 'docente' OR NOT docente_puede_ver(p_alumno) THEN
    RETURN QUERY SELECT 'no_encontrado'::text, NULL::text; RETURN;
  END IF;
  SELECT * INTO c FROM consentimiento_tutor WHERE alumno_id = p_alumno ORDER BY creado_en DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'no_encontrado'::text, NULL::text; RETURN; END IF;
  IF c.revocado_en IS NOT NULL THEN
    INSERT INTO consentimiento_tutor (alumno_id, tutor_nombre, tutor_email, parentesco, version_aviso, token_hash, token_expira_en)
    VALUES (p_alumno, c.tutor_nombre, c.tutor_email, c.parentesco, fn_aviso_vigente(), p_token_hash, p_expira);
  ELSE
    UPDATE consentimiento_tutor SET token_hash = p_token_hash, token_expira_en = p_expira, otp_hash = NULL WHERE id = c.id;
  END IF;
  RETURN QUERY SELECT 'ok'::text, c.tutor_email::text;
END $$;

-- ───────────── Autenticación: sin consentimiento vigente el alumno no entra ni conserva su sesión ─────────────
DROP FUNCTION IF EXISTS fn_auth_alumno(uuid, uuid);
CREATE FUNCTION fn_auth_alumno(p_grupo uuid, p_alumno uuid)
RETURNS TABLE(id uuid, nombre text, avatar text, pin_hash text, bloqueado_hasta timestamptz, consentimiento boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.nombre, a.avatar, a.pin_hash, a.bloqueado_hasta, c.vigente
    FROM alumno a CROSS JOIN LATERAL fn_consentimiento_vigente(a.id) c
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
    CROSS JOIN LATERAL fn_consentimiento_vigente(a.id) c
   WHERE s.token_hash = p_token_hash AND s.rol = 'alumno' AND s.expira_en > now() AND a.activo AND c.vigente $$;

GRANT EXECUTE ON FUNCTION fn_aviso_vigente(), fn_consentimiento_vigente(uuid), fn_consentimiento_por_token(text),
  fn_consentimiento_nuevo_otp(text, text), fn_consentimiento_aceptar(text, text, text, text, inet),
  fn_consentimiento_revocar(text, text, inet), fn_renovar_invitacion(uuid, text, timestamptz),
  fn_auth_alumno(uuid, uuid), fn_sesion_auth(text) TO numotion_app;
