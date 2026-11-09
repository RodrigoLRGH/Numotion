-- 0011 · Gamificación (EXP-06: RF-03, RF-22, RF-63, RF-65..68).
-- · practica_libre.ejercicios: los 5 ejercicios generados al iniciar el juego, en orden.
-- · perfil_gamificacion.ultimo_mensaje_*: mensaje motivacional del día (no repetir el de ayer, EXP-06.5).
-- · Catálogos de insignias (02-…§4) y mensajes motivacionales. Idempotente.

ALTER TABLE practica_libre ADD COLUMN ejercicios uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE perfil_gamificacion
  ADD COLUMN ultimo_mensaje_id uuid REFERENCES mensaje_motivacional(id) ON DELETE SET NULL,
  ADD COLUMN ultimo_mensaje_fecha date;

-- La racha se lee con fn_racha_vigente; días de la semana con práctica para la vista L–V
CREATE INDEX IF NOT EXISTS practica_alumno_completada_idx ON practica_libre (alumno_id, completada_en) WHERE completada_en IS NOT NULL;
CREATE INDEX IF NOT EXISTS intento_practica_idx ON intento_ejercicio (practica_id, ejercicio_id, numero_intento) WHERE practica_id IS NOT NULL;

-- ───────────── Insignias (regla evaluada por evaluarInsignias en TypeScript) ─────────────
INSERT INTO insignia (clave, nombre, descripcion, icono, regla) VALUES
  ('primera_actividad', '¡Primer paso!', 'Completaste tu primera actividad', '🎯', '{"tipo":"asignaciones_completadas","min":1}'),
  ('racha_5', '5 días seguidos', 'Practicaste 5 días de escuela seguidos', '🔥', '{"tipo":"racha","min":5}'),
  ('racha_10', '10 días seguidos', 'Practicaste 10 días de escuela seguidos', '🏆', '{"tipo":"racha","min":10}'),
  ('valiente', 'Valiente', 'Pediste ayuda y luego acertaste 3 ejercicios seguidos', '🦁', '{"tipo":"ayuda_y_aciertos_seguidos","aciertos":3}'),
  ('constante', 'Constante', 'Completaste 20 juegos de práctica libre', '🐢', '{"tipo":"practicas_completadas","min":20}'),
  ('explorador', 'Explorador', 'Jugaste 4 tipos de juego distintos', '🧭', '{"tipo":"tipos_juego_distintos","min":4}')
ON CONFLICT (clave) DO NOTHING;

INSERT INTO insignia (clave, nombre, descripcion, icono, regla)
SELECT 'maestro_' || t.clave, 'Maestro de ' || lower(t.nombre),
       'Terminaste 5 actividades de ' || lower(t.nombre) || ' con 8 o más', '🎓',
       jsonb_build_object('tipo', 'maestria_tema', 'temaClave', t.clave, 'asignaciones', 5, 'resultadoMin', 8)
  FROM tema t
 WHERE t.clave IN ('numeros','suma','resta','multiplicacion','division','geometria','fracciones')
ON CONFLICT (clave) DO NOTHING;

-- ───────────── Mensajes motivacionales ({nombre}, {racha}) ─────────────
-- Tono positivo siempre; nunca "perdiste tu racha" (EXP-06.3). Condición: estadoInicial[], rachaMin, rachaMax.
CREATE UNIQUE INDEX IF NOT EXISTS mensaje_motivacional_texto_uidx ON mensaje_motivacional (texto);
INSERT INTO mensaje_motivacional (texto, condicion) VALUES
  ('¡Hola, {nombre}! Paso a paso se llega lejos 👣', '{}'),
  ('{nombre}, cada ejercicio te hace más fuerte en matemáticas 💪', '{}'),
  ('Hoy es un gran día para aprender algo nuevo, {nombre} 🌈', '{}'),
  ('¡Qué gusto verte, {nombre}! Tu cerebro está listo para crecer 🧠', '{}'),
  ('¡{nombre}, llevas {racha} días seguidos! Sigue así 🔥', '{"rachaMin":2}'),
  ('¡Increíble, {nombre}! {racha} días de práctica sin parar 🏆', '{"rachaMin":5}'),
  ('¡Empieza una nueva racha hoy, {nombre}! Un juego basta 🎮', '{"rachaMax":0}'),
  ('¡{nombre}, hoy tienes energía de campeón! Vamos por un reto 🚀', '{"estadoInicial":["positivo"]}'),
  ('{nombre}, con esa actitud ¡nada te detiene! 🌟', '{"estadoInicial":["positivo"]}'),
  ('Vamos con calma, {nombre}. Aquí te acompañamos 🤗', '{"estadoInicial":["frustracion"]}'),
  ('Respira hondo, {nombre}. Equivocarse también es aprender 🌱', '{"estadoInicial":["frustracion"]}'),
  ('{nombre}, empecemos con un juego divertido 🎈', '{"estadoInicial":["desinteres"]}'),
  ('¿Listo para una sorpresa, {nombre}? Hoy hay retos nuevos 🎁', '{"estadoInicial":["desinteres"]}')
ON CONFLICT (texto) DO NOTHING;
