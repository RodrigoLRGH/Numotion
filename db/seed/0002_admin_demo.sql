-- Administrador de DEMOSTRACIÓN (npm run db:seed). Nunca aplicar en producción: ahí se usa npm run admin:crear.
-- admin@numotion.mx / numotion-admin-demo → /admin/entrar (bandeja de solicitudes ARCO)
INSERT INTO administrador (id, nombre, email, password_hash) VALUES
  ('ad000000-0000-4000-8000-000000000001', 'Admin Demo', 'admin@numotion.mx',
   'scrypt$7uwrMonU7mOhqxSU+xochw==$/Bt6LCwhMWxAu5yZjyzzAAI2q3/4YFK4xt4TR4tf7r3jGRM58GEn1lzXqO0EWsX731xK/BaB74Z4yS1EGgYyCw==')
ON CONFLICT DO NOTHING;
