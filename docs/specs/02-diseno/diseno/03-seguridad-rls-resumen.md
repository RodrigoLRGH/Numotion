# Seguridad, privacidad y RLS

Cubre RNF-03, RNF-04, RNF-10, RI-09, RC-05, RC-07, RC-08.

## 1. Modelo de amenazas (resumen)

| Amenaza | Activo | Control |
|---|---|---|
| Docente ve alumnos de otro grupo | Datos de menores | Autorización en servicio + RLS (§4) |
| Robo de imágenes faciales | Biométricos | No se persisten (§5); TLS; sin logs del body |
| Suplantación de alumno | Cuenta alumno | PIN pictográfico + bloqueo + token corto |
| Fuerza bruta a docente | Cuenta docente | bcrypt (cost 12), rate-limit 10/min/IP, bloqueo 15 min tras 10 fallos |
| Fuga de claves AWS/OpenAI | Infra/costos | Secrets Manager, IAM mínimo, rotación; escaneo de secretos en CI (gitleaks) |
| XSS en notas/ejercicios generados | Sesiones | React escapa por defecto; prohibido `dangerouslySetInnerHTML`; CSP estricta |
| Datos a OpenAI | Privacidad | Prompt sin PII ni emociones (ADR-007) |
| Uso sin consentimiento | Cumplimiento legal | Guard bloqueante (ADR-009) |

## 2. Autenticación

| Rol | Mecanismo | Token |
|---|---|---|
| Docente | email + contraseña (mín. 10 caracteres) | JWT de acceso 15 min + refresh 7 días (cookie `HttpOnly; Secure; SameSite=Strict`, rotativa) |
| Alumno | código de grupo + avatar + PIN de 4 íconos (de 12 posibles → 20 736 combinaciones) | JWT 4 h, sin refresh; claims `{sub, role:'alumno', grupoId, sesionId, camara:boolean}` |

- JWT firmado con RS256; clave en Secrets Manager.
- Logout invalida el refresh (lista de revocación en BD).
- Revocación de consentimiento invalida tokens del alumno (verificación `consentimiento vigente` en middleware con caché de 60 s).

## 3. Autorización en la API

Middlewares (en `apps/api/src/modules/core/auth`):
```ts
requireAuth            // valida JWT
requireRole('docente') // o 'alumno'
requireConsent         // alumno: consentimiento vigente
withDbContext          // SET LOCAL app.user_id / app.role en la transacción
```
Reglas:
- Rutas `/api/v1/docente/**` → `requireRole('docente')`.
- Rutas `/api/v1/alumno/**` → `requireRole('alumno') + requireConsent`. El alumno **solo** opera sobre `sub` (nunca recibe `alumnoId` en el body).
- Recursos de otro dueño responden **404** (no 403) para no revelar existencia; se audita `acceso_denegado`.

## 4. Row Level Security (migración `0004_rls.sql`)

```sql
ALTER TABLE alumno ENABLE ROW LEVEL SECURITY;  -- igual para todas las tablas con datos de alumno

CREATE FUNCTION app_user() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
CREATE FUNCTION app_role() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT current_setting('app.role', true) $$;

-- ¿El docente actual es dueño del grupo del alumno?
CREATE FUNCTION docente_puede_ver(p_alumno uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM alumno a JOIN grupo g ON g.id = a.grupo_id
                 WHERE a.id = p_alumno AND g.docente_id = app_user()) $$;

CREATE POLICY alumno_docente ON alumno FOR SELECT
  USING (app_role() = 'docente' AND docente_puede_ver(id));
CREATE POLICY alumno_self ON alumno FOR SELECT
  USING (app_role() = 'alumno' AND id = app_user());
```

| Tabla | Docente | Alumno |
|---|---|---|
| `alumno`, `racha_alumno`, `perfil_gamificacion`, `alumno_insignia` | SELECT si `docente_puede_ver(alumno_id)` | SELECT propio |
| `panas_resultado`, `diagnostico_mat_resultado`, `retroalimentacion` | SELECT si `docente_puede_ver` | INSERT/SELECT propio |
| `evento_emocional` | SELECT si `docente_puede_ver` | INSERT propio; **sin SELECT** (el alumno no ve sus emociones, RF-65) |
| `actividad` | ALL si `docente_id = app_user()` | SELECT si tiene asignación |
| `asignacion_alumno` | SELECT si dueño de la actividad | SELECT/UPDATE propio |
| `intento_ejercicio`, `practica_libre` | SELECT si `docente_puede_ver` | INSERT/SELECT propio |
| `alerta` | SELECT/UPDATE si `docente_id = app_user()` | UPDATE `alumno_acepto_ayuda` propio |
| `nota_docente`, `resultado_academico` | ALL si `docente_puede_ver` | sin acceso |
| `consentimiento_tutor` | SELECT (solo estado) si `docente_puede_ver` | sin acceso |
| `auditoria_acceso` | sin acceso (solo rol `admin`) | sin acceso |

- La app se conecta con un rol `numotion_app` **sin** `BYPASSRLS`. Migraciones con `numotion_owner`.
- Cada request abre transacción y ejecuta `SELECT set_config('app.user_id', $1, true), set_config('app.role', $2, true)`.

## 5. Datos biométricos (RNF-03, RC-05, ADR-002)

| Punto | Control |
|---|---|
| Captura | `canvas.toBlob('image/jpeg', 0.6)` de 320 px; el blob se libera tras el envío; nunca a `localStorage`/IndexedDB |
| Transporte | HTTPS (TLS 1.2+), `Content-Type: image/jpeg`, máx. 100 KB |
| Backend | `express.raw({limit:'100kb'})` solo en esa ruta; buffer → `DetectFaces` → `buffer.fill(0)`; nada se escribe a disco/S3 |
| Logs | El logger (pino) excluye `req.body` de `/emociones/frame`; prueba P-SEC-06 |
| BD | Solo `emocion`, `confianza`, `estado_derivado` |
| Rekognition | Se usa `DetectFaces` (no `IndexFaces`, no colecciones) → AWS no almacena el rostro |
| Auditoría técnica | P-SEC-03: tras 100 frames, `SELECT` sobre todas las columnas `bytea`/`jsonb` y listado del bucket de la app no contienen imágenes |

## 6. Consentimiento y derechos ARCO (RNF-10, RC-07, RC-08)

1. El docente da de alta al alumno con correo del tutor → `consentimiento_tutor` con `token_hash` (7 días).
2. El tutor abre `/consentimiento/:token` (ruta pública): aviso de privacidad (versión), finalidades, datos tratados (incluye estado emocional derivado), transferencias (AWS, OpenAI sin PII), derechos ARCO y contacto.
3. Verificación: código OTP de 6 dígitos al correo del tutor + nombre y parentesco.
4. Casillas separadas: **plataforma** (obligatoria) y **cámara** (opcional).
5. Revocación y solicitudes ARCO desde el mismo enlace (`/consentimiento/:token/arco`) → se registran en auditoría y se atienden en ≤ 20 días hábiles (`fn_anonimizar_alumno`).
6. Cambio de versión del aviso → los consentimientos previos quedan "por renovar" y el alumno entra en modo bloqueado hasta renovar.

## 7. Transporte y cabeceras (RI-09)
- CloudFront con certificado ACM, redirección HTTP→HTTPS, TLS ≥ 1.2.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
- `Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://api.<dominio>; frame-ancestors 'none'`.
- `Permissions-Policy: camera=(self)`.
- `helmet()` en Express; CORS solo al dominio de la SPA.

## 8. Cifrado en reposo y secretos
- RDS cifrado (KMS). Backups cifrados, retención 7 días.
- Secrets Manager: `DATABASE_URL`, `JWT_PRIVATE_KEY`, `OPENAI_API_KEY`. Rekognition por **rol IAM** de la tarea (sin claves estáticas).
- IAM mínimo: `rekognition:DetectFaces` únicamente.
