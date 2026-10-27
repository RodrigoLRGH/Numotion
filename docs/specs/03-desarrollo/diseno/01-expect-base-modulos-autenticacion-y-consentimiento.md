# EXP-01 · Base: módulos Docente/Alumno, autenticación, consentimiento y plataforma

**Cubre:** RNF-04, RNF-06, RNF-10, RI-01, RI-09, RC-02, RC-07, RC-08 · **HU:** HU-01, HU-02, HU-03 · **Bloquea:** todos los demás EXP

## Objetivo
Dejar el proyecto refactorizado en dos módulos funcionales aislados sobre un núcleo común, con acceso seguro por rol y el consentimiento parental como requisito de uso.

## Expectativas verificables

| ID | Se espera que… | Verificación |
|---|---|---|
| EXP-01.1 | El código esté organizado en `modules/docente`, `modules/alumno` y `core`/`shared` (web y api), y el lint **falle** si `docente` importa de `alumno` o viceversa. | CI: `pnpm lint` con un import cruzado de prueba → error |
| EXP-01.2 | Un docente inicie sesión con correo/contraseña y obtenga acceso 15 min + refresh 7 días; un alumno entre con código + avatar + PIN y obtenga token 4 h. | P-SEC-02, P-ROUTE-01 |
| EXP-01.3 | Toda ruta `/docente/**` y `/alumno/**` exija el rol correcto y toda consulta corra con `app.user_id/app.role` (RLS activa). Un docente no pueda leer ni modificar ningún dato de alumnos ajenos. | P-SEC-01, P-DB-04 |
| EXP-01.4 | La entrada del alumno sea completable sin leer (íconos + audio) en ≤ 60 s. | P-UX-01 (subtarea) |
| EXP-01.5 | Ningún alumno sin consentimiento vigente pueda iniciar sesión; el consentimiento de cámara sea independiente; la revocación cierre sesiones. | P-SEC-04, P-ROUTE-03 |
| EXP-01.6 | Exista un sistema de tokens de diseño y componentes base que cumplan WCAG 2.1 AA. | P-A11Y-01 |
| EXP-01.7 | Todo el tráfico sea HTTPS con HSTS, CSP y `Permissions-Policy: camera=(self)`. | P-SEC-05 |
| EXP-01.8 | El entorno `dev` se despliegue en AWS desde IaC. | Pipeline `deploy-dev` verde |
| EXP-01.9 | Cada login, acceso a ficha, exportación y evento de consentimiento quede en `auditoria_acceso` inmutable; exista el flujo ARCO. | P-SEC-01, P-DB-04 |

## Componentes
- API: `core/auth` (jwt, password, pin, middlewares), `core/consent`, `core/audit`, `infra/db` (transacción con contexto RLS).
- Web: `shared/auth/AuthProvider`, guardas (`06-navegacion`), `modules/alumno/pages/EntrarAlumno`, `modules/docente/pages/LoginDocente`, `ConsentimientoTutor`.

## Notas de implementación
```ts
// infra/db/withContext.ts
export async function withContext<T>(user: {id: string; role: Rol}, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${user.id}, true), set_config('app.role', ${user.role}, true)`;
    return fn(tx);
  });
}
```
- PIN: se guarda `bcrypt(pin.join('-'))`; el orden importa.
- El endpoint de avatares del grupo devuelve solo nombre corto (primer nombre) para minimizar exposición.

## Fuera de alcance
SSO escolar, recuperación de contraseña por SMS, portal de padres.

## Riesgos
- Si el repo actual usa Supabase Auth/Firebase: conservar el proveedor para docentes y mapear el `uid` a `docente.id`; el login de alumno se implementa como función propia que emite JWT compatible.
