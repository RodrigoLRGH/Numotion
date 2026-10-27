-- 0001 · Esquema base (T-02-03). Fuente: docs/specs/02-diseno/diseno/01-modelo-de-datos-resumen-del-estado-final.md
-- Regla RNF-03 / RC-05: ninguna tabla contiene imágenes ni bytes faciales (sin columnas bytea).

CREATE EXTENSION IF NOT EXISTS citext;

-- ───────────── Enumeraciones ─────────────
CREATE TYPE rol_usuario         AS ENUM ('docente','alumno','admin');
CREATE TYPE tipo_interaccion    AS ENUM ('seleccion_multiple','arrastrar','numero_a_palabras',
                                         'identificar_numero','suma_figuras','completar_operacion',
                                         'colorear_figura');
CREATE TYPE estado_asignacion   AS ENUM ('pendiente','en_curso','completada');
CREATE TYPE destino_actividad   AS ENUM ('grupo','alumnos');
CREATE TYPE emocion_rekognition AS ENUM ('HAPPY','CALM','SURPRISED','CONFUSED','SAD','ANGRY',
                                         'FEAR','DISGUSTED','UNKNOWN','SIN_ROSTRO');
CREATE TYPE estado_emocional    AS ENUM ('positivo','neutral','frustracion','desinteres','sin_dato');
CREATE TYPE motivo_ajuste       AS ENUM ('desempeno','emocion','combinado','solicitud_ayuda','inicial');
-- 'generador': ejercicios del generador determinista existente (A-17)
CREATE TYPE origen_ejercicio    AS ENUM ('catalogo','openai','generador');
CREATE TYPE tipo_resultado      AS ENUM ('tarea','trabajo_clase','interrogacion','actividad_numotion');
CREATE TYPE tipo_error          AS ENUM ('calculo','procedimiento','lectura','ortografia','seleccion',
                                         'tiempo_agotado','otro');
CREATE TYPE guia_mostrada       AS ENUM ('ninguna','paso_a_paso','final');
CREATE TYPE afecto_panas        AS ENUM ('positivo','negativo');
CREATE TYPE etiqueta_nota       AS ENUM ('conducta','emocional','academico','otro');
CREATE TYPE accion_auditoria    AS ENUM ('login','login_fallido','ver_alumno','exportar','acceso_denegado',
                                         'consentimiento','revocacion','arco','logout');

-- ───────────── 3.1 Identidad y grupos ─────────────
CREATE TABLE docente (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre            text NOT NULL CHECK (length(nombre) BETWEEN 3 AND 120),
  email             citext NOT NULL UNIQUE,
  password_hash     text NOT NULL,
  activo            boolean NOT NULL DEFAULT true,
  intentos_fallidos int NOT NULL DEFAULT 0,
  bloqueado_hasta   timestamptz,
  creado_en         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE grupo (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  docente_id     uuid NOT NULL REFERENCES docente(id),
  nombre         text NOT NULL,
  grado          smallint NOT NULL CHECK (grado BETWEEN 1 AND 9),
  ciclo_escolar  text NOT NULL,
  codigo_acceso  char(6) NOT NULL UNIQUE CHECK (codigo_acceso ~ '^[A-Z0-9]{6}$'),
  creado_en      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX grupo_docente_idx ON grupo (docente_id);

CREATE TABLE alumno (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id          uuid NOT NULL REFERENCES grupo(id),
  nombre            text NOT NULL,
  apellidos         text NOT NULL DEFAULT '',
  avatar            text NOT NULL,
  pin_hash          text,
  intentos_fallidos int NOT NULL DEFAULT 0,
  bloqueado_hasta   timestamptz,
  intereses         text[] NOT NULL DEFAULT '{}',
  activo            boolean NOT NULL DEFAULT true,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grupo_id, avatar)
);

CREATE TABLE aviso_privacidad (
  version        text PRIMARY KEY,
  vigente_desde  timestamptz NOT NULL DEFAULT now(),
  url            text NOT NULL
);

CREATE TABLE consentimiento_tutor (
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
  CHECK (NOT acepta_camara OR acepta_plataforma)
);
CREATE UNIQUE INDEX consentimiento_vigente_uidx ON consentimiento_tutor (alumno_id)
  WHERE revocado_en IS NULL AND aceptado_en IS NOT NULL;

-- Sesiones opacas (ADR-010). Solo accesible por funciones SECURITY DEFINER.
CREATE TABLE sesion_auth (
  token_hash  text PRIMARY KEY,
  rol         rol_usuario NOT NULL,
  usuario_id  uuid NOT NULL,
  expira_en   timestamptz NOT NULL,
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sesion_auth_usuario_idx ON sesion_auth (usuario_id);

-- ───────────── 3.2 Catálogo pedagógico ─────────────
CREATE TABLE tema (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave      text NOT NULL UNIQUE,
  nombre     text NOT NULL,
  grado_min  smallint NOT NULL DEFAULT 1,
  grado_max  smallint NOT NULL DEFAULT 6,
  orden      smallint NOT NULL DEFAULT 0,
  CHECK (grado_min <= grado_max)
);

CREATE TABLE subtema (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tema_id  uuid NOT NULL REFERENCES tema(id),
  clave    text NOT NULL,
  nombre   text NOT NULL,
  UNIQUE (tema_id, clave)
);

CREATE TABLE ejercicio (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tema_id           uuid NOT NULL REFERENCES tema(id),
  subtema_id        uuid REFERENCES subtema(id),
  tipo_interaccion  tipo_interaccion NOT NULL,
  nivel             smallint NOT NULL CHECK (nivel BETWEEN 1 AND 5),
  enunciado         jsonb NOT NULL,
  respuesta         jsonb NOT NULL,
  opciones          jsonb,
  pasos_solucion    jsonb NOT NULL CHECK (jsonb_typeof(pasos_solucion) = 'array' AND jsonb_array_length(pasos_solucion) >= 2),
  origen            origen_ejercicio NOT NULL DEFAULT 'catalogo',
  activo            boolean NOT NULL DEFAULT true,
  creado_en         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ejercicio_tema_nivel_idx ON ejercicio (tema_id, nivel, tipo_interaccion) WHERE activo;

CREATE TABLE pregunta_diagnostico (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tema_id    uuid NOT NULL REFERENCES tema(id),
  grado      smallint NOT NULL CHECK (grado BETWEEN 1 AND 9),
  nivel      smallint NOT NULL CHECK (nivel BETWEEN 1 AND 5),
  enunciado  jsonb NOT NULL,
  opciones   jsonb NOT NULL,
  respuesta  jsonb NOT NULL
);

CREATE TABLE panas_item (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden      smallint NOT NULL,
  texto      text NOT NULL,
  afecto     afecto_panas NOT NULL,
  audio_url  text,
  version    text NOT NULL,
  UNIQUE (version, orden)
);

-- ───────────── 3.3 Sesión y diagnósticos ─────────────
CREATE TABLE sesion_alumno (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id            uuid NOT NULL REFERENCES alumno(id) ON DELETE CASCADE,
  fecha                date NOT NULL,
  iniciada_en          timestamptz NOT NULL DEFAULT now(),
  ultima_actividad_en  timestamptz NOT NULL DEFAULT now(),
  finalizada_en        timestamptz,
  creado_en            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alumno_id, fecha)
);

CREATE TABLE panas_resultado (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id        uuid NOT NULL UNIQUE REFERENCES sesion_alumno(id) ON DELETE CASCADE,
  alumno_id        uuid NOT NULL REFERENCES alumno(id) ON DELETE CASCADE,
  respuestas       jsonb NOT NULL DEFAULT '[]',
  afecto_positivo  numeric(3,2) CHECK (afecto_positivo BETWEEN 1 AND 5),
  afecto_negativo  numeric(3,2) CHECK (afecto_negativo BETWEEN 1 AND 5),
  completado_en    timestamptz,
  creado_en        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE diagnostico_mat_resultado (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id        uuid NOT NULL REFERENCES sesion_alumno(id) ON DELETE CASCADE,
  alumno_id        uuid NOT NULL REFERENCES alumno(id) ON DELETE CASCADE,
  tema_id          uuid NOT NULL REFERENCES tema(id),
  aciertos         smallint NOT NULL CHECK (aciertos >= 0),
  total            smallint NOT NULL CHECK (total > 0 AND aciertos <= total),
  nivel_dominio    smallint NOT NULL CHECK (nivel_dominio BETWEEN 1 AND 5),
  tiempo_total_ms  int NOT NULL CHECK (tiempo_total_ms >= 0),
  creado_en        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sesion_id, tema_id)
);
CREATE INDEX diag_alumno_tema_idx ON diagnostico_mat_resultado (alumno_id, tema_id, creado_en DESC);

CREATE TABLE retroalimentacion (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id                uuid NOT NULL UNIQUE REFERENCES sesion_alumno(id) ON DELETE CASCADE,
  alumno_id                uuid NOT NULL REFERENCES alumno(id) ON DELETE CASCADE,
  panas_id                 uuid REFERENCES panas_resultado(id) ON DELETE SET NULL,
  estado_inicial           estado_emocional NOT NULL,
  dominio_por_tema         jsonb NOT NULL DEFAULT '{}',
  nivel_sugerido_por_tema  jsonb NOT NULL DEFAULT '{}',
  observaciones            text[] NOT NULL DEFAULT '{}',
  creado_en                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX retro_alumno_idx ON retroalimentacion (alumno_id, creado_en DESC);

-- ───────────── 3.4 Actividades ─────────────
CREATE TABLE actividad (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  docente_id        uuid NOT NULL REFERENCES docente(id),
  nombre            text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 120),
  tema_id           uuid NOT NULL REFERENCES tema(id),
  tipo_interaccion  tipo_interaccion NOT NULL,
  fecha_asignacion  date NOT NULL,
  num_ejercicios    smallint NOT NULL DEFAULT 10 CHECK (num_ejercicios BETWEEN 3 AND 30),
  destino           destino_actividad NOT NULL,
  grupo_id          uuid REFERENCES grupo(id),
  creado_en         timestamptz NOT NULL DEFAULT now(),
  CHECK ((destino = 'grupo') = (grupo_id IS NOT NULL))
);
CREATE INDEX actividad_docente_idx ON actividad (docente_id, fecha_asignacion DESC);

CREATE TABLE asignacion_alumno (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actividad_id          uuid NOT NULL REFERENCES actividad(id) ON DELETE CASCADE,
  alumno_id             uuid NOT NULL REFERENCES alumno(id) ON DELETE CASCADE,
  nivel_inicial         smallint NOT NULL CHECK (nivel_inicial BETWEEN 1 AND 5),
  nivel_actual          smallint NOT NULL CHECK (nivel_actual BETWEEN 1 AND 5),
  estado                estado_asignacion NOT NULL DEFAULT 'pendiente',
  ejercicios_resueltos  smallint NOT NULL DEFAULT 0 CHECK (ejercicios_resueltos >= 0),
  puntaje               int NOT NULL DEFAULT 0 CHECK (puntaje >= 0),
  resultado_final       numeric(4,2) CHECK (resultado_final BETWEEN 0 AND 10),
  iniciada_en           timestamptz,
  completada_en         timestamptz,
  creado_en             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actividad_id, alumno_id)
);
CREATE INDEX asignacion_alumno_estado_idx ON asignacion_alumno (alumno_id, estado);
CREATE INDEX asignacion_actividad_idx ON asignacion_alumno (actividad_id);

-- ───────────── 3.6 Gamificación (antes de intento por la FK de práctica) ─────────────
CREATE TABLE practica_libre (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id      uuid NOT NULL REFERENCES alumno(id) ON DELETE CASCADE,
  juego          tipo_interaccion NOT NULL,
  tema_id        uuid NOT NULL REFERENCES tema(id),
  nivel          smallint NOT NULL DEFAULT 2 CHECK (nivel BETWEEN 1 AND 5),
  iniciada_en    timestamptz NOT NULL DEFAULT now(),
  completada_en  timestamptz,
  puntos         int NOT NULL DEFAULT 0 CHECK (puntos >= 0),
  creado_en      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX practica_alumno_idx ON practica_libre (alumno_id, completada_en);

CREATE TABLE intento_ejercicio (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asignacion_id     uuid REFERENCES asignacion_alumno(id) ON DELETE CASCADE,
  practica_id       uuid REFERENCES practica_libre(id) ON DELETE CASCADE,
  alumno_id         uuid NOT NULL REFERENCES alumno(id) ON DELETE CASCADE,
  ejercicio_id      uuid NOT NULL REFERENCES ejercicio(id),
  nivel             smallint NOT NULL CHECK (nivel BETWEEN 1 AND 5),
  respuesta         jsonb NOT NULL,
  correcta          boolean NOT NULL,
  tipo_error        tipo_error,
  numero_intento    smallint NOT NULL CHECK (numero_intento BETWEEN 1 AND 4),
  tiempo_ms         int NOT NULL CHECK (tiempo_ms >= 0),
  ayuda_solicitada  boolean NOT NULL DEFAULT false,
  guia_mostrada     guia_mostrada NOT NULL DEFAULT 'ninguna',
  cliente_id        uuid NOT NULL UNIQUE,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(asignacion_id, practica_id) = 1)
);
CREATE INDEX intento_asignacion_idx ON intento_ejercicio (asignacion_id, creado_en);
CREATE INDEX intento_alumno_idx ON intento_ejercicio (alumno_id, creado_en);

CREATE TABLE ajuste_dificultad (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asignacion_id  uuid NOT NULL REFERENCES asignacion_alumno(id) ON DELETE CASCADE,
  alumno_id      uuid NOT NULL REFERENCES alumno(id) ON DELETE CASCADE,
  nivel_anterior smallint NOT NULL CHECK (nivel_anterior BETWEEN 1 AND 5),
  nivel_nuevo    smallint NOT NULL CHECK (nivel_nuevo BETWEEN 1 AND 5),
  motivo         motivo_ajuste NOT NULL,
  detalle        jsonb NOT NULL DEFAULT '{}',
  creado_en      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ajuste_asignacion_idx ON ajuste_dificultad (asignacion_id, creado_en);

-- ───────────── 3.5 Emoción y alertas ─────────────
CREATE TABLE evento_emocional (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id        uuid NOT NULL REFERENCES alumno(id) ON DELETE CASCADE,
  sesion_id        uuid NOT NULL REFERENCES sesion_alumno(id) ON DELETE CASCADE,
  asignacion_id    uuid REFERENCES asignacion_alumno(id) ON DELETE SET NULL,
  emocion          emocion_rekognition NOT NULL,
  confianza        numeric(5,2) NOT NULL CHECK (confianza BETWEEN 0 AND 100),
  estado_derivado  estado_emocional NOT NULL,
  capturado_en     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evento_sesion_idx ON evento_emocional (sesion_id, capturado_en DESC);
CREATE INDEX evento_asignacion_idx ON evento_emocional (asignacion_id, capturado_en DESC);
CREATE INDEX evento_alumno_idx ON evento_emocional (alumno_id, capturado_en DESC);

CREATE TABLE guia_actuacion (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estado          estado_emocional NOT NULL,
  titulo          text NOT NULL,
  pasos           jsonb NOT NULL,
  mensaje_alumno  text NOT NULL
);

CREATE TABLE alerta (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id            uuid NOT NULL REFERENCES alumno(id) ON DELETE CASCADE,
  docente_id           uuid NOT NULL REFERENCES docente(id),
  asignacion_id        uuid REFERENCES asignacion_alumno(id) ON DELETE CASCADE,
  tipo                 text NOT NULL DEFAULT 'frustracion_temprana',
  indice               numeric(3,2) NOT NULL CHECK (indice BETWEEN 0 AND 1),
  senales              jsonb NOT NULL DEFAULT '{}',
  guia_id              uuid REFERENCES guia_actuacion(id),
  alumno_acepto_ayuda  boolean,
  atendida_en          timestamptz,
  atendida_por         uuid REFERENCES docente(id),
  creado_en            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX alerta_pendiente_idx ON alerta (docente_id, atendida_en) WHERE atendida_en IS NULL;
CREATE INDEX alerta_alumno_idx ON alerta (alumno_id, asignacion_id, creado_en DESC);

CREATE TABLE config_adaptativa (
  clave  text PRIMARY KEY,
  valor  jsonb NOT NULL
);

CREATE TABLE dia_inhabil (
  fecha        date PRIMARY KEY,
  descripcion  text NOT NULL
);

-- ───────────── 3.6 Gamificación (resto) ─────────────
CREATE TABLE perfil_gamificacion (
  alumno_id           uuid PRIMARY KEY REFERENCES alumno(id) ON DELETE CASCADE,
  puntos_totales      int NOT NULL DEFAULT 0 CHECK (puntos_totales >= 0),
  nivel_gamificacion  smallint NOT NULL DEFAULT 1 CHECK (nivel_gamificacion BETWEEN 1 AND 20),
  personaje           text NOT NULL DEFAULT 'explorador'
);

CREATE TABLE insignia (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave        text NOT NULL UNIQUE,
  nombre       text NOT NULL,
  descripcion  text NOT NULL,
  icono        text NOT NULL,
  regla        jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE alumno_insignia (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id    uuid NOT NULL REFERENCES alumno(id) ON DELETE CASCADE,
  insignia_id  uuid NOT NULL REFERENCES insignia(id),
  obtenida_en  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alumno_id, insignia_id)
);

CREATE TABLE racha_alumno (
  alumno_id         uuid PRIMARY KEY REFERENCES alumno(id) ON DELETE CASCADE,
  racha_actual      int NOT NULL DEFAULT 0 CHECK (racha_actual >= 0),
  mejor_racha       int NOT NULL DEFAULT 0,
  ultimo_dia_habil  date,
  CHECK (mejor_racha >= racha_actual)
);

CREATE TABLE mensaje_motivacional (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  texto      text NOT NULL,
  condicion  jsonb NOT NULL DEFAULT '{}'
);

-- ───────────── 3.7 Notas y resultados ─────────────
CREATE TABLE nota_docente (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  docente_id  uuid NOT NULL REFERENCES docente(id),
  alumno_id   uuid NOT NULL REFERENCES alumno(id) ON DELETE CASCADE,
  fecha       timestamptz NOT NULL DEFAULT now(),
  texto       text NOT NULL CHECK (length(texto) BETWEEN 1 AND 500),
  etiqueta    etiqueta_nota
);
CREATE INDEX nota_alumno_idx ON nota_docente (alumno_id, fecha DESC);

CREATE TABLE resultado_academico (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id      uuid NOT NULL REFERENCES alumno(id) ON DELETE CASCADE,
  tema_id        uuid NOT NULL REFERENCES tema(id),
  tipo           tipo_resultado NOT NULL,
  titulo         text NOT NULL,
  calificacion   numeric(4,2) NOT NULL CHECK (calificacion BETWEEN 0 AND 10),
  fecha          date NOT NULL,
  asignacion_id  uuid REFERENCES asignacion_alumno(id) ON DELETE CASCADE,
  capturado_por  uuid REFERENCES docente(id),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  CHECK (tipo <> 'actividad_numotion' OR asignacion_id IS NOT NULL)
);
CREATE INDEX resultado_alumno_tema_idx ON resultado_academico (alumno_id, tema_id);

-- ───────────── 3.8 Auditoría (RC-07) ─────────────
CREATE TABLE auditoria_acceso (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    uuid,
  actor_rol   rol_usuario,
  accion      accion_auditoria NOT NULL,
  recurso     text,
  recurso_id  text,
  ip          inet,
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auditoria_fecha_idx ON auditoria_acceso (creado_en);
