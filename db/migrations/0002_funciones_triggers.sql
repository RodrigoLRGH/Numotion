-- 0002 · Funciones y triggers (T-02-04). Fuente: docs/specs/02-diseno/diseno/02-funciones-triggers-y-reglas-migracion-0002.md
-- Las funciones SECURITY DEFINER fijan search_path y validan el contexto (app.user_id / app.role)
-- porque se ejecutan con permisos del dueño y saltan RLS.

-- ───────────── Contexto de la petición (ADR-003) ─────────────
CREATE FUNCTION app_user() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE FUNCTION app_role() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.role', true), '') $$;

-- ───────────── §1 Calendario (RF-67) ─────────────
CREATE FUNCTION fn_hoy_local() RETURNS date LANGUAGE sql STABLE AS
$$ SELECT (now() AT TIME ZONE 'America/Tijuana')::date $$;

-- Lun–vie que no estén en dia_inhabil (tabla vacía en el MVP)
CREATE FUNCTION fn_es_dia_habil(d date) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT extract(isodow FROM d) BETWEEN 1 AND 5
          AND NOT EXISTS (SELECT 1 FROM public.dia_inhabil i WHERE i.fecha = d) $$;

-- Días hábiles estrictamente entre a y b (excluye ambos extremos)
CREATE FUNCTION fn_dias_habiles_entre(a date, b date) RETURNS int LANGUAGE sql STABLE AS
$$ SELECT count(*)::int FROM generate_series(a + 1, b - 1, interval '1 day') g(d)
   WHERE fn_es_dia_habil(g.d::date) $$;

-- ───────────── §2 Racha (RF-67, RF-68, A-15) ─────────────
CREATE FUNCTION fn_registrar_practica() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d date := (NEW.completada_en AT TIME ZONE 'America/Tijuana')::date;
        r racha_alumno%ROWTYPE;
BEGIN
  IF NEW.completada_en IS NULL OR OLD.completada_en IS NOT NULL OR NOT fn_es_dia_habil(d) THEN
    RETURN NEW;
  END IF;
  INSERT INTO racha_alumno(alumno_id, racha_actual, mejor_racha) VALUES (NEW.alumno_id, 0, 0)
    ON CONFLICT (alumno_id) DO NOTHING;
  SELECT * INTO r FROM racha_alumno WHERE alumno_id = NEW.alumno_id FOR UPDATE;  -- concurrencia
  IF r.ultimo_dia_habil = d THEN RETURN NEW; END IF;                               -- una vez por día
  IF r.ultimo_dia_habil IS NOT NULL AND fn_dias_habiles_entre(r.ultimo_dia_habil, d) = 0 THEN
    r.racha_actual := r.racha_actual + 1;
  ELSE
    r.racha_actual := 1;
  END IF;
  UPDATE racha_alumno SET racha_actual = r.racha_actual,
         mejor_racha = greatest(r.mejor_racha, r.racha_actual),
         ultimo_dia_habil = d
   WHERE alumno_id = NEW.alumno_id;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_practica_racha AFTER UPDATE OF completada_en ON practica_libre
  FOR EACH ROW EXECUTE FUNCTION fn_registrar_practica();

-- La racha almacenada puede estar "vencida": siempre leer con esta función
CREATE FUNCTION fn_racha_vigente(p_alumno uuid, p_hoy date DEFAULT fn_hoy_local())
RETURNS TABLE(racha_actual int, mejor_racha int) LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN r.ultimo_dia_habil IS NULL THEN 0
              WHEN fn_dias_habiles_entre(r.ultimo_dia_habil, p_hoy) > 0 THEN 0
              ELSE r.racha_actual END,
         r.mejor_racha
  FROM racha_alumno r WHERE r.alumno_id = p_alumno $$;

-- ───────────── §3.2 Estado inicial desde PANAS-C (RF-61) ─────────────
CREATE FUNCTION fn_estado_inicial(ap numeric, an numeric) RETURNS estado_emocional
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN an >= 3.0 THEN 'frustracion'
              WHEN ap >= 3.5 AND an < 2.5 THEN 'positivo'
              WHEN ap < 2.5 THEN 'desinteres'
              ELSE 'neutral' END::estado_emocional $$;

-- ───────────── §3.5 Nivel inicial (RF-57) ─────────────
CREATE FUNCTION fn_nivel_inicial(p_alumno uuid, p_tema uuid) RETURNS smallint
LANGUAGE plpgsql STABLE AS $$
DECLARE base smallint; est estado_emocional;
BEGIN
  SELECT d.nivel_dominio INTO base FROM diagnostico_mat_resultado d
   WHERE d.alumno_id = p_alumno AND d.tema_id = p_tema AND d.creado_en > now() - interval '30 days'
   ORDER BY d.creado_en DESC LIMIT 1;
  IF base IS NULL THEN RETURN 2; END IF;                        -- sin diagnóstico (CU-04 A1)
  SELECT r.estado_inicial INTO est FROM retroalimentacion r
   WHERE r.alumno_id = p_alumno ORDER BY r.creado_en DESC LIMIT 1;
  IF est = 'frustracion' THEN base := base - 1; END IF;
  RETURN greatest(1, least(5, base));
END $$;

-- ───────────── §5 Avance de asignación (RF-60, RF-35) ─────────────
CREATE FUNCTION fn_intento_actualiza_asignacion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a asignacion_alumno%ROWTYPE; cerrado boolean; total smallint; correctos int;
BEGIN
  IF NEW.asignacion_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO a FROM asignacion_alumno WHERE id = NEW.asignacion_id FOR UPDATE;
  IF a.alumno_id <> NEW.alumno_id THEN RAISE EXCEPTION 'ASIGNACION_AJENA'; END IF;
  IF a.estado = 'completada' THEN RAISE EXCEPTION 'ASIGNACION_COMPLETADA'; END IF;
  IF a.estado = 'pendiente' THEN
    a.estado := 'en_curso'; a.iniciada_en := now();
  END IF;
  cerrado := NEW.correcta OR NEW.numero_intento >= 4;
  IF cerrado THEN a.ejercicios_resueltos := a.ejercicios_resueltos + 1; END IF;
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

CREATE TRIGGER trg_intento_asignacion AFTER INSERT ON intento_ejercicio
  FOR EACH ROW EXECUTE FUNCTION fn_intento_actualiza_asignacion();

-- ───────────── §6 Registro atómico de asignación (RF-56, RF-57) ─────────────
CREATE FUNCTION fn_registrar_asignacion(
  p_docente uuid, p_nombre text, p_tema uuid, p_tipo tipo_interaccion, p_fecha date,
  p_num smallint, p_grupo uuid, p_alumnos uuid[]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_act uuid; v_destinos uuid[];
BEGIN
  IF app_role() IS DISTINCT FROM 'docente' OR p_docente IS DISTINCT FROM app_user() THEN
    RAISE EXCEPTION 'NO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;
  IF (p_grupo IS NULL) = (coalesce(array_length(p_alumnos, 1), 0) = 0) THEN
    RAISE EXCEPTION 'ASIGNACION_DESTINO_INVALIDO';             -- excluyente
  END IF;
  IF p_grupo IS NOT NULL THEN
    PERFORM 1 FROM grupo WHERE id = p_grupo AND docente_id = p_docente;
    IF NOT FOUND THEN RAISE EXCEPTION 'GRUPO_NO_PERMITIDO'; END IF;
    SELECT array_agg(id) INTO v_destinos FROM alumno WHERE grupo_id = p_grupo AND activo;
    IF v_destinos IS NULL THEN RAISE EXCEPTION 'GRUPO_SIN_ALUMNOS'; END IF;
  ELSE
    SELECT array_agg(a.id) INTO v_destinos FROM alumno a JOIN grupo g ON g.id = a.grupo_id
     WHERE a.id = ANY(p_alumnos) AND g.docente_id = p_docente AND a.activo;
    IF coalesce(array_length(v_destinos, 1), 0) <> array_length(p_alumnos, 1) THEN
      RAISE EXCEPTION 'ALUMNO_NO_PERMITIDO';
    END IF;
  END IF;
  INSERT INTO actividad(docente_id, nombre, tema_id, tipo_interaccion, fecha_asignacion, num_ejercicios,
                        destino, grupo_id)
  VALUES (p_docente, p_nombre, p_tema, p_tipo, p_fecha, p_num,
          CASE WHEN p_grupo IS NULL THEN 'alumnos' ELSE 'grupo' END::destino_actividad, p_grupo)
  RETURNING id INTO v_act;
  INSERT INTO asignacion_alumno(actividad_id, alumno_id, nivel_inicial, nivel_actual, estado)
  SELECT v_act, x, fn_nivel_inicial(x, p_tema), fn_nivel_inicial(x, p_tema), 'pendiente'
    FROM unnest(v_destinos) x;
  RETURN v_act;
END $$;

-- ───────────── §7 Retroalimentación (RF-61) ─────────────
CREATE FUNCTION fn_generar_retroalimentacion(p_sesion uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s sesion_alumno%ROWTYPE; p panas_resultado%ROWTYPE; est estado_emocional;
        dominio jsonb; sugerido jsonb; obs text[]; v_id uuid;
BEGIN
  SELECT * INTO s FROM sesion_alumno WHERE id = p_sesion;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESION_NO_ENCONTRADA'; END IF;
  IF app_role() = 'alumno' AND s.alumno_id IS DISTINCT FROM app_user() THEN
    RAISE EXCEPTION 'NO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO p FROM panas_resultado WHERE sesion_id = p_sesion AND completado_en IS NOT NULL;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM diagnostico_mat_resultado WHERE sesion_id = p_sesion) THEN
    RETURN NULL;                                                  -- aún faltan diagnósticos
  END IF;
  est := fn_estado_inicial(p.afecto_positivo, p.afecto_negativo);

  SELECT jsonb_object_agg(d.tema_id, d.nivel_dominio),
         jsonb_object_agg(d.tema_id, greatest(1, least(5, d.nivel_dominio - CASE WHEN est = 'frustracion' THEN 1 ELSE 0 END))),
         coalesce(array_agg('AN alto y dominio bajo en ' || t.nombre)
                    FILTER (WHERE p.afecto_negativo >= 3.0 AND d.nivel_dominio <= 2), '{}')
    INTO dominio, sugerido, obs
    FROM diagnostico_mat_resultado d JOIN tema t ON t.id = d.tema_id
   WHERE d.sesion_id = p_sesion;

  INSERT INTO retroalimentacion(sesion_id, alumno_id, panas_id, estado_inicial, dominio_por_tema,
                                nivel_sugerido_por_tema, observaciones)
  VALUES (p_sesion, s.alumno_id, p.id, est, dominio, sugerido, obs)
  ON CONFLICT (sesion_id) DO UPDATE SET panas_id = EXCLUDED.panas_id, estado_inicial = EXCLUDED.estado_inicial,
         dominio_por_tema = EXCLUDED.dominio_por_tema, nivel_sugerido_por_tema = EXCLUDED.nivel_sugerido_por_tema,
         observaciones = EXCLUDED.observaciones
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ───────────── §8 Otros ─────────────
CREATE FUNCTION fn_purgar_eventos_emocionales() RETURNS int
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH b AS (DELETE FROM evento_emocional WHERE capturado_en < now() - interval '180 days' RETURNING 1)
  SELECT count(*)::int FROM b $$;

CREATE FUNCTION fn_anonimizar_alumno(p_alumno uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE alumno SET nombre = 'Alumno anonimizado', apellidos = '', pin_hash = NULL,
         intereses = '{}', activo = false, avatar = 'anon-' || id::text
   WHERE id = p_alumno;
  DELETE FROM nota_docente WHERE alumno_id = p_alumno;
  DELETE FROM evento_emocional WHERE alumno_id = p_alumno;
  DELETE FROM sesion_auth WHERE rol = 'alumno' AND usuario_id = p_alumno;
  UPDATE consentimiento_tutor SET tutor_nombre = 'anonimizado', tutor_email = 'anonimizado@invalid',
         parentesco = NULL, ip = NULL, revocado_en = coalesce(revocado_en, now())
   WHERE alumno_id = p_alumno;
END $$;

CREATE FUNCTION fn_auditoria_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'AUDITORIA_INMUTABLE'; END $$;
CREATE TRIGGER trg_auditoria_inmutable BEFORE UPDATE OR DELETE ON auditoria_acceso
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_inmutable();

CREATE FUNCTION fn_tocar_sesion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'evento_emocional' THEN
    UPDATE sesion_alumno SET ultima_actividad_en = now() WHERE id = NEW.sesion_id;
  ELSE
    UPDATE sesion_alumno SET ultima_actividad_en = now()
     WHERE alumno_id = NEW.alumno_id AND fecha = fn_hoy_local();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_tocar_sesion_intento AFTER INSERT ON intento_ejercicio
  FOR EACH ROW EXECUTE FUNCTION fn_tocar_sesion();
CREATE TRIGGER trg_tocar_sesion_evento AFTER INSERT ON evento_emocional
  FOR EACH ROW EXECUTE FUNCTION fn_tocar_sesion();

-- Lectura de estados emocionales recientes para el motor (IF, ventana) sin dar SELECT
-- sobre evento_emocional al alumno (RF-65). Solo devuelve los del alumno en contexto.
CREATE FUNCTION fn_estados_recientes(p_segundos int)
RETURNS TABLE(emocion emocion_rekognition, estado_derivado estado_emocional, capturado_en timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.emocion, e.estado_derivado, e.capturado_en FROM evento_emocional e
   WHERE app_role() = 'alumno' AND e.alumno_id = app_user()
     AND e.capturado_en > now() - make_interval(secs => p_segundos)
   ORDER BY e.capturado_en DESC $$;

-- ───────────── Autenticación y consentimiento (ADR-004, ADR-009, ADR-010) ─────────────
-- Consentimiento vigente: aceptado, no revocado, con plataforma y para la versión actual del aviso.
CREATE FUNCTION fn_consentimiento_vigente(p_alumno uuid)
RETURNS TABLE(vigente boolean, acepta_camara boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(c.id) > 0, coalesce(bool_or(c.acepta_camara), false)
    FROM consentimiento_tutor c
   WHERE c.alumno_id = p_alumno AND c.aceptado_en IS NOT NULL AND c.revocado_en IS NULL
     AND c.acepta_plataforma
     AND c.version_aviso = (SELECT version FROM aviso_privacidad WHERE vigente_desde <= now()
                             ORDER BY vigente_desde DESC LIMIT 1) $$;

CREATE FUNCTION fn_auditar(p_actor uuid, p_rol rol_usuario, p_accion accion_auditoria,
                           p_recurso text DEFAULT NULL, p_recurso_id text DEFAULT NULL, p_ip inet DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO auditoria_acceso(actor_id, actor_rol, accion, recurso, recurso_id, ip)
  VALUES (p_actor, p_rol, p_accion, p_recurso, p_recurso_id, p_ip) $$;

CREATE FUNCTION fn_registrar_docente(p_nombre text, p_email citext, p_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO docente(nombre, email, password_hash) VALUES (p_nombre, p_email, p_hash) RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'EMAIL_DUPLICADO';
END $$;

-- Datos para verificar la contraseña en la app (el hash nunca es legible por SELECT directo)
CREATE FUNCTION fn_auth_docente(p_email citext)
RETURNS TABLE(id uuid, nombre text, password_hash text, activo boolean, bloqueado_hasta timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, d.nombre, d.password_hash, d.activo, d.bloqueado_hasta FROM docente d WHERE d.email = p_email $$;

-- Docente: bloqueo 15 min tras 10 fallos (03-seguridad §1)
CREATE FUNCTION fn_auth_docente_resultado(p_docente uuid, p_exito boolean, p_ip inet) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_exito THEN
    UPDATE docente SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = p_docente;
    PERFORM fn_auditar(p_docente, 'docente', 'login', NULL, NULL, p_ip);
  ELSE
    UPDATE docente SET intentos_fallidos = intentos_fallidos + 1,
           bloqueado_hasta = CASE WHEN intentos_fallidos + 1 >= 10 THEN now() + interval '15 minutes' END
     WHERE id = p_docente;
    UPDATE docente SET intentos_fallidos = 0 WHERE id = p_docente AND bloqueado_hasta IS NOT NULL;
    PERFORM fn_auditar(p_docente, 'docente', 'login_fallido', NULL, NULL, p_ip);
  END IF;
END $$;

-- Paso 2 del acceso del alumno: avatares del grupo (sin nombres, ADR-004)
CREATE FUNCTION fn_avatares_grupo(p_codigo text)
RETURNS TABLE(avatar text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.avatar FROM alumno a JOIN grupo g ON g.id = a.grupo_id
   WHERE g.codigo_acceso = upper(p_codigo) AND a.activo ORDER BY a.avatar $$;

CREATE FUNCTION fn_auth_alumno(p_codigo text, p_avatar text)
RETURNS TABLE(id uuid, nombre text, grupo_id uuid, pin_hash text, bloqueado_hasta timestamptz,
              consentimiento boolean, acepta_camara boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.nombre, a.grupo_id, a.pin_hash, a.bloqueado_hasta, c.vigente, c.acepta_camara
    FROM alumno a JOIN grupo g ON g.id = a.grupo_id
    CROSS JOIN LATERAL fn_consentimiento_vigente(a.id) c
   WHERE g.codigo_acceso = upper(p_codigo) AND a.avatar = p_avatar AND a.activo $$;

-- Alumno: bloqueo 5 min tras 5 fallos (ADR-004). En éxito crea/reanuda la sesión del día.
CREATE FUNCTION fn_auth_alumno_resultado(p_alumno uuid, p_exito boolean, p_ip inet) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sesion uuid;
BEGIN
  IF NOT p_exito THEN
    UPDATE alumno SET intentos_fallidos = intentos_fallidos + 1,
           bloqueado_hasta = CASE WHEN intentos_fallidos + 1 >= 5 THEN now() + interval '5 minutes' END
     WHERE id = p_alumno;
    UPDATE alumno SET intentos_fallidos = 0 WHERE id = p_alumno AND bloqueado_hasta IS NOT NULL;
    PERFORM fn_auditar(p_alumno, 'alumno', 'login_fallido', NULL, NULL, p_ip);
    RETURN NULL;
  END IF;
  UPDATE alumno SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = p_alumno;
  INSERT INTO perfil_gamificacion(alumno_id) VALUES (p_alumno) ON CONFLICT DO NOTHING;
  INSERT INTO racha_alumno(alumno_id) VALUES (p_alumno) ON CONFLICT DO NOTHING;
  INSERT INTO sesion_alumno(alumno_id, fecha) VALUES (p_alumno, fn_hoy_local())
    ON CONFLICT (alumno_id, fecha) DO UPDATE SET ultima_actividad_en = now()
    RETURNING id INTO v_sesion;
  PERFORM fn_auditar(p_alumno, 'alumno', 'login', NULL, NULL, p_ip);
  RETURN v_sesion;
END $$;

CREATE FUNCTION fn_crear_sesion_auth(p_token_hash text, p_rol rol_usuario, p_usuario uuid, p_expira timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM sesion_auth WHERE expira_en < now();
  INSERT INTO sesion_auth(token_hash, rol, usuario_id, expira_en) VALUES (p_token_hash, p_rol, p_usuario, p_expira) $$;

CREATE FUNCTION fn_cerrar_sesion_auth(p_token_hash text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM sesion_auth WHERE token_hash = p_token_hash $$;

-- Resuelve la sesión. Para el alumno exige consentimiento vigente: revocar corta el acceso (EXP-01.5).
CREATE FUNCTION fn_sesion_auth(p_token_hash text)
RETURNS TABLE(rol rol_usuario, usuario_id uuid, nombre text, grupo_id uuid, acepta_camara boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.rol, s.usuario_id, d.nombre, NULL::uuid, false
    FROM sesion_auth s JOIN docente d ON d.id = s.usuario_id
   WHERE s.token_hash = p_token_hash AND s.rol = 'docente' AND s.expira_en > now() AND d.activo
  UNION ALL
  SELECT s.rol, s.usuario_id, a.nombre, a.grupo_id, c.acepta_camara
    FROM sesion_auth s JOIN alumno a ON a.id = s.usuario_id
    CROSS JOIN LATERAL fn_consentimiento_vigente(a.id) c
   WHERE s.token_hash = p_token_hash AND s.rol = 'alumno' AND s.expira_en > now() AND a.activo AND c.vigente $$;
