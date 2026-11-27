-- Datos de DEMOSTRACIÓN para desarrollo local (npm run db:seed). Nunca aplicar en producción.
-- Docente: demo@numotion.mx / numotion-demo · Grupo 3A, código DEMO42
-- Alumnos (PIN de íconos):
--   Ana   (gato)   sol-luna-pez-sol           consentimiento vigente
--   Beto  (perro)  casa-casa-arbol-flor       consentimiento vigente
--   Caro  (conejo) estrella-nube-coche-pelota SIN consentimiento (para probar el bloqueo, RC-08)
-- La cámara se usa con todos los alumnos con consentimiento (A-41).

-- Temas, PANAS-C y config_adaptativa vienen de db/migrations/0005_catalogos.sql

INSERT INTO docente (id, nombre, email, password_hash) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'Laura Demo', 'demo@numotion.mx',
   'scrypt$efXXh6UmSkZnej9g0ttPmw==$E3Lo6aWqfmxI6YrADT2jdS3GTkNuG8ljZg1K+t7xPpFgnDZ+uwVKGXWTDZ1Umu1Sn0F4AKBrbZ+WRSB/WsJliQ==')
ON CONFLICT DO NOTHING;

INSERT INTO grupo (id, docente_id, nombre, grado, ciclo_escolar, codigo_acceso) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', '3A', 3, '2026-2027', 'DEMO42')
ON CONFLICT DO NOTHING;

INSERT INTO alumno (id, grupo_id, nombre, apellidos, avatar, pin_hash) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Ana', 'López', 'gato',
   'scrypt$3/ynaWi8UinmbC0LTK7Elg==$LW6P4ysVCmxJJg5DfhcwfZhcllDSlp7NdRV1DWjtsFXfDwiWFm5mCFqT0iLU25D6KqAJ2jKJZZbzBG0RxDGX2w=='),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Beto', 'Ramírez', 'perro',
   'scrypt$O6dO6RKzbxifI6tfHtRUng==$M/7QmoEMX5hEG3BBi7J3rqLcPPJUCj/TJAiuLks3qcS9OqyRqBMTomSZf6SYrPZ0FXtKN5QdIUh1ivcwTLuG4g=='),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Caro', 'Núñez', 'conejo',
   'scrypt$Ge5RP9mxSNIabSMgT1MlWQ==$rqDawPdg5Jyt3OY/YTEjtCWckF33xhk3NRy61h/4zIdf4kfRTPvovSxYrzibWvpndjgGypxxQE7Wv4RWpTJlaw==')
ON CONFLICT DO NOTHING;

-- El aviso v1 lo crea la migración 0016
INSERT INTO consentimiento_tutor (alumno_id, tutor_nombre, tutor_email, parentesco, version_aviso,
                                  acepta_plataforma, acepta_camara, aceptado_en, token_hash, token_expira_en) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'Rosa López', 'rosa@ejemplo.mx', 'madre', 'v1', true, true, now(),
   'demo-token-ana', now() + interval '7 days'),
  ('b0000000-0000-4000-8000-000000000002', 'Jorge Ramírez', 'jorge@ejemplo.mx', 'padre', 'v1', true, true, now(),
   'demo-token-beto', now() + interval '7 days'),
  ('b0000000-0000-4000-8000-000000000003', 'Marta Núñez', 'marta@ejemplo.mx', 'madre', 'v1', false, false, NULL,
   'demo-token-caro', now() + interval '7 days')
ON CONFLICT DO NOTHING;
