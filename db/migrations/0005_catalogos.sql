-- 0005 · Catálogos base (T-02-07, parcial). Contenido PROVISIONAL hasta su validación:
--   PANAS-C → T-01-03 · banco del diagnóstico → T-01-04 (mientras, A-20) · guías → T-01-05
-- Idempotente: se puede volver a aplicar sobre datos existentes.

INSERT INTO tema (clave, nombre, grado_min, grado_max, orden) VALUES
  ('numeros', 'Números', 1, 6, 1),
  ('suma', 'Suma', 1, 6, 2),
  ('resta', 'Resta', 1, 6, 3),
  ('multiplicacion', 'Multiplicación', 2, 6, 4),
  ('division', 'División', 3, 6, 5),
  ('geometria', 'Geometría', 1, 6, 6),
  ('fracciones', 'Fracciones', 3, 6, 7)
ON CONFLICT (clave) DO NOTHING;

-- PANAS-C forma breve: propuesta de EXP-02 (a validar en T-01-03)
INSERT INTO panas_item (orden, texto, afecto, version) VALUES
  (1,  '¿Qué tan alegre te sientes hoy?', 'positivo', 'v1'),
  (2,  '¿Qué tan triste te sientes hoy?', 'negativo', 'v1'),
  (3,  '¿Qué tan contento o contenta estás hoy?', 'positivo', 'v1'),
  (4,  '¿Qué tan enojado o enojada te sientes hoy?', 'negativo', 'v1'),
  (5,  '¿Qué tan feliz te sientes hoy?', 'positivo', 'v1'),
  (6,  '¿Qué tan asustado o asustada te sientes hoy?', 'negativo', 'v1'),
  (7,  '¿Cuánta energía tienes hoy?', 'positivo', 'v1'),
  (8,  '¿Cuánto miedo sientes hoy?', 'negativo', 'v1'),
  (9,  '¿Qué tan orgulloso u orgullosa de ti te sientes hoy?', 'positivo', 'v1'),
  (10, '¿Qué tan desanimado o desanimada te sientes hoy?', 'negativo', 'v1')
ON CONFLICT (version, orden) DO NOTHING;

-- Umbrales del motor (02-diseno/02-…, valores por defecto entre corchetes)
INSERT INTO config_adaptativa (clave, valor) VALUES
  ('panas_version', '"v1"'),
  ('diagnostico_corto_dias', '7'),
  ('conf_min', '60'),
  ('ventana_seg', '60'),
  ('inactividad_seg', '45'),
  ('umbral_alerta', '0.6'),
  ('cooldown_alerta_min', '5'),
  ('max_intentos', '4'),
  ('tiempo_referencia_ms', '30000')
ON CONFLICT (clave) DO NOTHING;
