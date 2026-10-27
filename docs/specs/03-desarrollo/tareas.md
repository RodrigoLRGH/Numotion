# 03 · Desarrollo — Tareas atómicas

Cada tarea: **≤ 1 día**, con entregable y pruebas. Marcar `[x]` al cumplir la Definition of Done (`convenciones.md §7`).
Formato: `- [ ] T-03-<EXP>-<n> · descripción → archivos · pruebas`

## EXP-01 · Base, módulos, auth y consentimiento
- [~] T-03-01-01 · *(en curso: código Astro DB apartado en `legacy/`; auth, middleware y grupos ya sobre PostgreSQL)* · Mover el código existente a la estructura `modules/{docente,alumno}` + `shared`/`core` según el mapeo de `estado-actual.md §4` (sin cambiar comportamiento) → web y api · build verde
- [ ] T-03-01-02 · `infra/config`: carga y validación de variables de entorno con Zod (falla al arrancar si faltan) → `apps/api/src/infra/config.ts` · P-UNIT-10
- [x] T-03-01-03 · `infra/db/withContext` + middleware `withDbContext` → P-DB-04 *(`conContexto` en `src/modules/shared/servidor/db.ts`, usado por middleware y endpoints)*
- [x] T-03-01-04 · *(ADR-010: scrypt + sesiones opacas en BD, docente 8 h / alumno 4 h, en lugar de bcrypt + JWT)* · Hash de contraseña (bcrypt 12) y emisión/verificación JWT RS256 (acceso 15 min, refresh 7 días rotativo en cookie) → `core/auth/{password,jwt}.ts` · P-SEC-02
- [x] T-03-01-05 · *(`/api/v1/auth/docente/{login,registro}`, `/api/v1/auth/logout`; bloqueo 15 min tras 10 fallos en BD; sin refresh por ADR-010; rate-limit por IP pendiente)* · `POST /auth/docente/login|refresh`, `POST /auth/logout` con rate-limit y bloqueo → P-SEC-02
- [x] T-03-01-06 · *(`/api/v1/auth/alumno/grupo/:codigo`, `/api/v1/auth/alumno/login`)* · `GET /auth/alumno/grupo/:codigo` y `POST /auth/alumno/login` (PIN pictográfico, bloqueo 5 min tras 5 fallos, crea/reanuda `sesion_alumno`) → P-SEC-02
- [x] T-03-01-07 · *(middleware + `decidirAcceso`; el consentimiento se verifica en cada petición dentro de `fn_sesion_auth`, sin caché)* · Middlewares `requireAuth`, `requireRole`, `requireConsent` (caché 60 s) → P-SEC-01, P-SEC-04
- [ ] T-03-01-08 · `core/audit` + registro en login, ficha, exportación, consentimiento, acceso denegado → P-SEC-01
- [~] T-03-01-09 · *(alta de grupo y alumno lista en `/api/v1/docente/grupos[/:id/alumnos]`; falta el envío del correo al tutor: hoy el docente recibe el enlace)* · Alta de grupo (`codigoAcceso` único) y alta de alumno con envío de invitación al tutor (SES o proveedor SMTP) → P-API-08
- [ ] T-03-01-10 · Endpoints de consentimiento: ver aviso, OTP, aceptar (plataforma/cámara), revocar, ARCO → P-SEC-04
- [ ] T-03-01-11 · Web: `AuthProvider`, `http.ts` (refresh automático, traducción de 401/403 a navegación) → P-ROUTE-01
- [ ] T-03-01-12 · Web: router y guardas `RequireRole`, `RedirectIfAuth`, `RequireConsent` → P-ROUTE-01, P-ROUTE-03
- [ ] T-03-01-13 · Web: `LoginDocente` → P-E2E-02
- [ ] T-03-01-14 · Web: `EntrarAlumno` (código → avatar → PIN, con audio) → P-E2E-01, P-A11Y-01
- [ ] T-03-01-15 · Web: `ConsentimientoTutor` (aviso, OTP, casillas separadas, revocar, ARCO) → P-E2E-01
- [x] T-03-01-16 · *(CSP, HSTS en producción, Permissions-Policy, nosniff, X-Frame-Options en `cabeceras.ts`; CORS innecesario: misma origen)* · Cabeceras de seguridad: helmet, CSP, HSTS, Permissions-Policy, CORS → P-SEC-05
- [ ] T-03-01-17 · Logger pino con redacción de PII y exclusión de body en `/emociones/frame` → P-SEC-06
- [ ] T-03-01-18 · Despliegue `dev` en AWS desde IaC (T-02-14) con pipeline → pipeline verde

## EXP-02 · Diagnósticos
- [ ] T-03-02-01 · `core/diagnostico/panas.ts`: `calcularPanas`, `estadoInicialDesdePanas` → P-UNIT-05
- [ ] T-03-02-02 · Endpoints PANAS (GET ítems + respondidos, PUT respuesta incremental, POST finalizar) → P-API-03
- [ ] T-03-02-03 · `core/diagnostico/matematico.ts`: selección escalonada y `nivelDominio` → P-UNIT-06
- [ ] T-03-02-04 · Endpoints diagnóstico matemático (siguiente, responder, finalizar) incl. versión corta → P-API-03
- [ ] T-03-02-05 · `fn_generar_retroalimentacion` invocada al finalizar; idempotente → P-API-03
- [ ] T-03-02-06 · Middleware API `requireDiagnosticos` en rutas de panel/actividades/práctica → P-API-03
- [ ] T-03-02-07 · Web: `EscalaCaritas` + `BotonAudio` (`useSpeak` es-MX) → P-COMP-05, P-A11Y-01
- [ ] T-03-02-08 · Web: página `PanasC` (un ítem por pantalla, progreso, retomar) → P-E2E-01
- [ ] T-03-02-09 · Web: página `DiagnosticoMatematico` (reutiliza componentes de ejercicio) → P-E2E-01
- [ ] T-03-02-10 · Web: guardas `RequirePanas`, `RequireDiagnosticos` y reinicio por cambio de día → P-ROUTE-02

## EXP-03 · Asignación y seguimiento (Docente)
- [ ] T-03-03-01 · Esquema `CrearActividad` con `DestinoActividad` discriminado → P-API-01
- [ ] T-03-03-02 · `GET /docente/actividades/previsualizar-niveles` → P-API-01
- [ ] T-03-03-03 · `POST /docente/actividades` → `fn_registrar_asignacion`; mapear excepciones SQL a 422/404 → P-API-01, P-DB-02, P-DB-06
- [ ] T-03-03-04 · `GET /docente/actividades` con resumen por estado y detalle por alumno → P-API-04
- [ ] T-03-03-05 · `GET /docente/historial` con filtros y cursor → P-API-04
- [ ] T-03-03-06 · Web: `FormularioAsignacion` (wizard 3 pasos, destino excluyente, previsualización) → P-COMP-04
- [ ] T-03-03-07 · Web: `ActividadesAsignadas` con refresco 30 s → P-E2E-02
- [ ] T-03-03-08 · Web: `Historial` con filtros persistidos en la URL → P-E2E-02

## EXP-04 · Motor de ejercicios y adaptación
- [ ] T-03-04-01 · `GET /alumno/actividades` y Web `MisActividades` + `TarjetaActividad` → P-API-02
- [ ] T-03-04-02 · `core/adaptive/decidirNivel.ts` (función pura, tabla §3.4, lee umbrales de `config_adaptativa`) → P-UNIT-01
- [ ] T-03-04-03 · `core/content/seleccionarEjercicio.ts` (tema, tipo, nivel, sin repetir) → P-UNIT-11
- [ ] T-03-04-04 · `core/content/clasificarError.ts` → P-UNIT-08
- [ ] T-03-04-05 · Servicio `registrarIntento` (flujo del EXP-04) con idempotencia `clienteId` → P-API-02, P-DB-03
- [ ] T-03-04-06 · `POST /alumno/actividades/:id/iniciar` (recalcular nivel inicial del día) y `GET …/siguiente` → P-API-02
- [ ] T-03-04-07 · Generación de `hashRespuesta` y `EjercicioPublico` (sin respuesta) → P-API-02
- [ ] T-03-04-08 · Guía: `GET /alumno/ejercicios/:id/guia` + inclusión automática en intento 3 (paso a paso) y 4 (final) → P-API-02
- [ ] T-03-04-09 · Web: `useActividadStore` + `useMotorActividad` (cronómetro que pausa con pestaña oculta) → P-COMP-01
- [ ] T-03-04-10 · Web: `EjercicioSeleccionMultiple` → P-COMP-01
- [ ] T-03-04-11 · Web: `EjercicioArrastrar` (dnd-kit + alternativa por tap/teclado) → P-COMP-01
- [ ] T-03-04-12 · Web: `EjercicioCompletarOperacion` (RF-42) → P-COMP-01
- [ ] T-03-04-13 · Web: `EjercicioNumeroAPalabras` (RF-39) → P-COMP-01
- [ ] T-03-04-14 · Web: `EjercicioIdentificarNumero` (RF-40, Could) → P-COMP-01
- [ ] T-03-04-15 · Web: `EjercicioSumaFiguras` (RF-41, Could) → P-COMP-01
- [ ] T-03-04-16 · Web: `EjercicioColorearFigura` (RF-44, Could) → P-COMP-01
- [ ] T-03-04-17 · Web: `GuiaPasoAPaso` (modos paso_a_paso / final) → P-COMP-02
- [ ] T-03-04-18 · Web: `RecompensaModal` al completar → P-E2E-01
- [ ] T-03-04-19 · Web: `useColaIntentos` (IndexedDB con try/catch, backoff, indicador "Guardando…") → P-E2E-05
- [ ] T-03-04-20 · `core/content/ContentGateway` (OpenAI): prompt sin PII, timeout 20 s, validación del ejercicio generado, caché, presupuesto mensual, respaldo de catálogo → P-INT-02
- [ ] T-03-04-21 · Precarga del siguiente ejercicio y code splitting del módulo alumno → P-PERF-01

## EXP-05 · Emoción y alertas
- [ ] T-03-05-01 · `core/emotion/emotionGateway.ts` (DetectFaces con bytes, descarte, timeout 3 s) → P-INT-01
- [ ] T-03-05-02 · `core/emotion/derivarEstado.ts` (por frame y ventana) → P-UNIT-07
- [ ] T-03-05-03 · `core/emotion/indiceFrustracion.ts` (con y sin cámara) → P-UNIT-02
- [ ] T-03-05-04 · `POST /alumno/emociones/frame` (`express.raw` 100 KB, rate-limit 1/5 s, tope diario, métrica) → P-SEC-03, P-SEC-06
- [ ] T-03-05-05 · `core/alertas/evaluarAlerta.ts` (2 evaluaciones consecutivas, cooldown 5 min) → P-UNIT-02
- [ ] T-03-05-06 · `AlertBus` (EventEmitter + LISTEN/NOTIFY) y `GET /docente/alertas/stream` (SSE, heartbeat) → P-API-07
- [ ] T-03-05-07 · `GET /docente/alertas`, `GET /docente/guias/:id`, `POST /docente/alertas/:id/atender` → P-API-07
- [ ] T-03-05-08 · `POST /alumno/alertas/:id/respuesta` → aplica R2 del motor → P-API-07
- [ ] T-03-05-09 · Web: `useEmotionCapture` + `CameraPermissionGate` + indicador de cámara → P-E2E-04
- [ ] T-03-05-10 · Web: `PreguntaAyuda` en el alumno → P-E2E-03
- [ ] T-03-05-11 · Web: `useAlertasStream`, `AlertaToast`, campana y `DetalleAlerta` + `GuiaActuacion` → P-E2E-03
- [ ] T-03-05-12 · Job de purga de `evento_emocional` (180 días) → P-DB-07

## EXP-06 · Gamificación
- [ ] T-03-06-01 · `core/gamificacion/puntos.ts` y `niveles.ts` → P-UNIT-09
- [ ] T-03-06-02 · `core/gamificacion/insignias.ts` (`evaluarInsignias`) → P-UNIT-09
- [ ] T-03-06-03 · Endpoints de práctica libre (listar, iniciar, completar) → P-DB-01, P-E2E-01
- [ ] T-03-06-04 · `GET /alumno/panel` (racha vía `fn_racha_vigente`, insignias, gamificación, mensaje) → P-API-09
- [ ] T-03-06-05 · Selección de mensaje motivacional (condición + no repetir) → P-UNIT-12
- [ ] T-03-06-06 · Web: `PanelAlumno`, `RachaVisual`, `Insignias`, `MensajeMotivacional`, `Personaje` → P-COMP-03
- [ ] T-03-06-07 · Web: `PerfilAlumno` y `PracticaLibre` → P-COMP-03, P-E2E-01

## EXP-07 · Dashboard docente
- [ ] T-03-07-01 · `GET /docente/grupos/:id/resumen` (vista `v_estado_emocional_reciente`) → P-API-03
- [ ] T-03-07-02 · Web: `PanelDocente` con `ResumenPrevio`, `DistribucionEmocional`, `TablaAlumnosEstado` → P-E2E-02
- [ ] T-03-07-03 · `GET /docente/alumnos/:id` + Web `FichaAlumno` (tab Resumen) → P-API-06
- [ ] T-03-07-04 · `GET …/perfil-estadistico` + tab Perfil estadístico → P-API-05
- [ ] T-03-07-05 · `GET/POST …/resultados` + `CapturaResultado` + consolidado → P-API-06
- [ ] T-03-07-06 · `GET …/cruce` + `CruceTemaChart` → P-API-06
- [ ] T-03-07-07 · `GET/POST …/notas` + `NotaRapida` (también desde alerta) → P-API-06
- [ ] T-03-07-08 · Refresco de `mv_indice_tema_grupo` (cada 15 min + al completar asignación) → P-DB-08
- [ ] T-03-07-09 · `GET …/reportes/temas` (+ CSV auditado) + página `Reportes` → P-API-05, P-PERF-02
