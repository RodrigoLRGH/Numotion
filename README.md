# Numotion

Plataforma de práctica de matemáticas para primaria con adaptación por desempeño y estado emocional.
Especificaciones en [`docs/specs`](docs/specs/README.md); decisiones de arquitectura en [`adr.md`](docs/specs/00-contexto/adr.md) (ADR-011).

## Estructura

```
apps/web       SPA: React + Vite + React Router (módulos docente y alumno)
apps/api       API: Express + Zod (módulos core, docente, alumno) sobre PostgreSQL con RLS
packages/core  dominio puro compartido por web y api
db/            migraciones SQL (fuente de verdad) y seed de demostración
tests/         unidad · componentes · db · api (Supertest) · e2e (Playwright)
legacy/        código anterior pendiente de migrar (no se compila)
```

## Arranque local

Requisitos: Node 20+ (probado con 24), Docker.

```sh
npm install
cp .env.example .env
docker compose up -d        # PostgreSQL 16 en el puerto 5433
npm run db:seed             # migraciones + datos de demostración
npm run dev                 # API en :3000 y web en http://localhost:5173
```

Datos de demostración (`db/seed/0001_demo.sql`):
- Docente: `demo@numotion.mx` / `numotion-demo`
- Alumnos: grupo `DEMO42`; Ana (gato) con PIN ☀️🌙🐟☀️ (sol, luna, pez, sol)

## Pruebas

| Comando | Qué corre |
|---|---|
| `npm test` | Unitarias y de componentes |
| `npm run test:db` | Servicios y API (Supertest) contra PostgreSQL (necesita Docker) |
| `npm run test:e2e` | Recorridos completos con Playwright y axe, en escritorio y tableta |
| `npm run typecheck` | TypeScript en core, api, web y pruebas |

## Base de datos y Prisma

Las migraciones SQL de `db/migrations` son la fuente de verdad (RLS, funciones, triggers). Prisma solo las refleja:

```sh
npm run db:migrar   # aplica migraciones nuevas
npm run db:pull     # regenera apps/api/prisma/schema.prisma y el cliente
```

Reglas para escribir consultas: ver el encabezado de `apps/api/src/infra/db.ts` y ADR-012.

## Despliegue (Vercel)

`vercel.json` publica `apps/web/dist` como sitio estático y la API como función (`api/index.mjs`).

1. **Base de datos:** crea un PostgreSQL administrado (por ejemplo Neon desde el Marketplace de Vercel). Necesitas dos cadenas de conexión: la del rol dueño (migraciones) y la del rol `numotion_app` (la app).
2. **Migraciones** desde tu equipo, con el rol dueño:
   ```sh
   DATABASE_OWNER_URL="postgres://…owner…" NUMOTION_APP_PASSWORD="<contraseña fuerte>" npm run db:migrar
   ```
   Crea el rol `numotion_app` (sin BYPASSRLS) con esa contraseña. **No** apliques `db:seed` en producción.
3. **Proyecto en Vercel:** `npx vercel login` y `npx vercel link` en la raíz del repo.
4. **Variables** (Settings → Environment Variables):
   - `DATABASE_URL` = conexión **pooled** con el rol `numotion_app` + `?pgbouncer=true&connection_limit=1`
   - `NODE_ENV=production`, `WEB_ORIGIN=https://<tu-dominio>`
   - `CORREO_PROVEEDOR=smtp`, `SMTP_USUARIO`, `SMTP_PASSWORD`, `MAIL_FROM` (ver «Correo»)
   - `EMOTION_PROVIDER` y `AWS_REGION` cuando se active la cámara (EXP-05)
5. **Despliegue de prueba:** `npx vercel` (preview). Comprueba `/api/v1/catalogo/temas` (200 con temas) y el registro de un docente.
6. **Producción:** `npx vercel --prod`.

## Correo (Google Workspace)

La invitación al tutor y los códigos de verificación se envían por SMTP de Google Workspace.

1. En la cuenta remitente (p. ej. `numotion@tu-escuela.edu.mx`) activa la **verificación en dos pasos**.
2. Crea una **contraseña de aplicación** en <https://myaccount.google.com/apppasswords> (si no aparece, el administrador de Workspace debe permitirlas).
3. Configura las variables (en `.env` para local y en *Settings → Environment Variables* de Vercel para producción):
   ```sh
   CORREO_PROVEEDOR=smtp
   SMTP_USUARIO=numotion@tu-escuela.edu.mx
   SMTP_PASSWORD=abcd efgh ijkl mnop   # la contraseña de aplicación
   MAIL_FROM="Numotion <numotion@tu-escuela.edu.mx>"
   ```
   `MAIL_FROM` debe ser la misma cuenta o un alias configurado en Gmail como "Enviar como"; si no, Gmail lo reemplaza.
4. Verifica: `npm run correo:probar -- tu@correo.mx`.

Límite de Google Workspace: unos 2 000 mensajes al día por cuenta. En desarrollo usa `CORREO_PROVEEDOR=archivo` (los correos quedan en `tmp/correos`).
