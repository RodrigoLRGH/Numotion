-- 0007 · Flujo público del consentimiento del tutor (T-03-01-10, ADR-009, 03-seguridad §6).
-- El tutor no tiene cuenta: se identifica con el token de su enlace + un código de un solo uso
-- (OTP de 6 dígitos) enviado a su correo. Todo pasa por funciones SECURITY DEFINER.
-- Las funciones devuelven un código de resultado en lugar de lanzar excepciones para que los
-- intentos fallidos de OTP queden registrados (una excepción revertiría el contador).

ALTER TABLE consentimiento_tutor
  ADD COLUMN otp_intentos   int NOT NULL DEFAULT 0,
  ADD COLUMN otp_enviado_en timestamptz;

CREATE TYPE tipo_arco AS ENUM ('acceso','rectificacion','cancelacion','oposicion','revocacion');

-- Solicitudes ARCO y revocaciones: se atienden en ≤ 20 días hábiles (RC-07)
CREATE TABLE solicitud_arco (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id          uuid NOT NULL REFERENCES alumno(id) ON DELETE CASCADE,
  consentimiento_id  uuid NOT NULL REFERENCES consentimiento_tutor(id) ON DELETE CASCADE,
  tipo               tipo_arco NOT NULL,
  detalle            text NOT NULL DEFAULT '' CHECK (length(detalle) <= 1000),
  creada_en          timestamptz NOT NULL DEFAULT now(),
  atendida_en        timestamptz
);
CREATE INDEX solicitud_arco_pendiente_idx ON solicitud_arco (creada_en) WHERE atendida_en IS NULL;

ALTER TABLE solicitud_arco ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON solicitud_arco TO numotion_app;
CREATE POLICY arco_docente ON solicitud_arco FOR SELECT USING (es_docente() AND docente_puede_ver(alumno_id));

-- Versión vigente del aviso de privacidad
CREATE FUNCTION fn_aviso_vigente() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT version FROM aviso_privacidad WHERE vigente_desde <= now() ORDER BY vigente_desde DESC LIMIT 1 $$;

-- Datos mínimos para la página del tutor: nombre de pila del alumno, grupo y docente (sin apellidos).
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

-- Acepta (o actualiza la preferencia de cámara). El enlace vence a los 7 días para aceptar (A-24).
-- resultado: 'ok' | 'token_invalido' | 'token_vencido' | 'revocado' | 'otp_invalido' | 'otp_vencido'
CREATE FUNCTION fn_consentimiento_aceptar(p_token_hash text, p_otp_hash text, p_tutor_nombre text,
                                          p_parentesco text, p_acepta_camara boolean, p_ip inet) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c consentimiento_tutor%ROWTYPE; r text;
BEGIN
  SELECT * INTO c FROM consentimiento_tutor WHERE token_hash = p_token_hash;
  IF NOT FOUND THEN RETURN 'token_invalido'; END IF;
  IF c.revocado_en IS NOT NULL THEN RETURN 'revocado'; END IF;
  -- Una vez aceptado, el tutor puede cambiar su preferencia aunque el enlace haya vencido
  IF c.aceptado_en IS NULL AND c.token_expira_en < now() THEN RETURN 'token_vencido'; END IF;
  r := fn_consentimiento_usar_otp(c.id, p_otp_hash);
  IF r <> 'ok' THEN RETURN r; END IF;
  UPDATE consentimiento_tutor
     SET tutor_nombre = p_tutor_nombre, parentesco = p_parentesco, acepta_plataforma = true,
         acepta_camara = p_acepta_camara, version_aviso = fn_aviso_vigente(), aceptado_en = now(), ip = p_ip
   WHERE id = c.id;
  PERFORM fn_auditar(NULL, NULL, 'consentimiento', 'alumno', c.alumno_id::text, p_ip);
  RETURN 'ok';
END $$;

-- Revoca: corta las sesiones del alumno y deja pendiente el borrado de sus datos (03-seguridad §6.5).
CREATE FUNCTION fn_consentimiento_revocar(p_token_hash text, p_otp_hash text, p_ip inet) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c consentimiento_tutor%ROWTYPE; r text;
BEGIN
  SELECT * INTO c FROM consentimiento_tutor WHERE token_hash = p_token_hash;
  IF NOT FOUND THEN RETURN 'token_invalido'; END IF;
  IF c.revocado_en IS NOT NULL THEN RETURN 'revocado'; END IF;
  r := fn_consentimiento_usar_otp(c.id, p_otp_hash);
  IF r <> 'ok' THEN RETURN r; END IF;
  UPDATE consentimiento_tutor SET revocado_en = now() WHERE id = c.id;
  DELETE FROM sesion_auth WHERE rol = 'alumno' AND usuario_id = c.alumno_id;
  INSERT INTO solicitud_arco (alumno_id, consentimiento_id, tipo) VALUES (c.alumno_id, c.id, 'revocacion');
  PERFORM fn_auditar(NULL, NULL, 'revocacion', 'alumno', c.alumno_id::text, p_ip);
  RETURN 'ok';
END $$;

-- Solicitud ARCO (acceso, rectificación, cancelación, oposición). Vale aun con el enlace vencido.
CREATE FUNCTION fn_consentimiento_arco(p_token_hash text, p_otp_hash text, p_tipo tipo_arco, p_detalle text, p_ip inet)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c consentimiento_tutor%ROWTYPE; r text;
BEGIN
  IF p_tipo = 'revocacion' THEN RETURN 'tipo_invalido'; END IF;
  SELECT * INTO c FROM consentimiento_tutor WHERE token_hash = p_token_hash;
  IF NOT FOUND THEN RETURN 'token_invalido'; END IF;
  r := fn_consentimiento_usar_otp(c.id, p_otp_hash);
  IF r <> 'ok' THEN RETURN r; END IF;
  INSERT INTO solicitud_arco (alumno_id, consentimiento_id, tipo, detalle) VALUES (c.alumno_id, c.id, p_tipo, p_detalle);
  PERFORM fn_auditar(NULL, NULL, 'arco', 'alumno', c.alumno_id::text, p_ip);
  RETURN 'ok';
END $$;

-- El docente genera un enlace nuevo (vencido, revocado o aviso por renovar).
-- Si el último consentimiento fue revocado se crea uno nuevo con los mismos datos del tutor.
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

GRANT EXECUTE ON FUNCTION fn_aviso_vigente(), fn_consentimiento_por_token(text), fn_consentimiento_nuevo_otp(text, text),
  fn_consentimiento_aceptar(text, text, text, text, boolean, inet), fn_consentimiento_revocar(text, text, inet),
  fn_consentimiento_arco(text, text, tipo_arco, text, inet), fn_renovar_invitacion(uuid, text, timestamptz) TO numotion_app;
