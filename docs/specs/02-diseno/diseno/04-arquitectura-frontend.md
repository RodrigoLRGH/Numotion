# Arquitectura frontend

SPA React 18 + TypeScript + Vite (ADR-008). Dos módulos de negocio independientes (`docente`, `alumno`) sobre `shared` (ADR-001).

## 1. Estructura

```
apps/web/src/
├─ app/
│  ├─ router.tsx               # createBrowserRouter (ver 06-navegacion)
│  ├─ providers.tsx            # QueryClientProvider, AuthProvider, ThemeProvider
│  └─ main.tsx
├─ modules/
│  ├─ docente/
│  │  ├─ pages/                # PanelDocente, Grupos, FichaAlumno, NuevaActividad,
│  │  │                        # ActividadesAsignadas, Historial, Reportes, Alertas
│  │  ├─ components/           # ResumenPrevio, TarjetaAlumnoEstado, FormularioAsignacion,
│  │  │                        # TablaSeguimiento, PerfilEstadistico, CruceTemaChart,
│  │  │                        # NotaRapida, CapturaResultado, AlertaToast, GuiaActuacion
│  │  ├─ hooks/                # useAlertasStream, useResumenGrupo, ...
│  │  └─ api/                  # docenteApi.ts (TanStack Query keys + fetchers)
│  ├─ alumno/
│  │  ├─ pages/                # Entrar, PanasC, DiagnosticoMatematico, PanelAlumno,
│  │  │                        # ResolverActividad, Perfil, PracticaLibre
│  │  ├─ components/           # TarjetaActividad, RachaVisual, Insignias, Personaje,
│  │  │                        # MensajeMotivacional, EscalaCaritas, BotonAudio,
│  │  │                        # GuiaPasoAPaso, RecompensaModal, PreguntaAyuda
│  │  ├─ ejercicios/           # Un componente por tipo_interaccion + registry
│  │  ├─ hooks/                # useMotorActividad, useColaIntentos
│  │  └─ api/                  # alumnoApi.ts
├─ shared/
│  ├─ ui/                      # Button, Card, Dialog, Toast, Skeleton (tokens RI-01)
│  ├─ api/http.ts              # fetch wrapper: base URL, auth, refresh, errores tipados
│  ├─ auth/                    # AuthProvider, useAuth, RequireRole
│  ├─ camera/                  # useEmotionCapture, CameraPermissionGate
│  ├─ audio/                   # useSpeak (speechSynthesis es-MX)
│  └─ lib/                     # normalizarTexto, levenshtein, fechas
└─ styles/tokens.css
```
Tipos y esquemas de API se importan de `packages/contracts` (fuente única con el backend).

## 2. Estado
| Tipo | Herramienta | Ejemplos |
|---|---|---|
| Servidor | TanStack Query | asignaciones, perfil, reportes (staleTime 30 s; alertas por SSE) |
| Sesión | `AuthProvider` (contexto) | token, rol, flags `camara`, `diagnosticosCompletos` |
| Actividad en curso | Zustand `useActividadStore` | ejercicio actual, intento, cronómetro, nivel |
| Cola offline | IndexedDB (`idb-keyval`) con try/catch | intentos pendientes (RI-05) |

## 3. Motor de actividad en el cliente (`useMotorActividad`)
```
cargar asignación → GET siguiente ejercicio
  ├─ inicia cronómetro (performance.now())
  ├─ alumno responde → validación local inmediata (feedback < 100 ms, RNF-01)
  ├─ POST /alumno/intentos {clienteId, ejercicioId, respuesta, tiempoMs, numeroIntento, ayudaSolicitada}
  │     respuesta servidor: {correcta, puntos, guia?, ejercicioCerrado, siguiente?, nivel, alerta?}
  ├─ si servidor difiere de validación local → servidor manda (se corrige la UI)
  └─ si offline → encola; reintenta con backoff; clienteId garantiza idempotencia
```
La validación local usa los mismos validadores de `packages/contracts/validadores` que el backend; la respuesta correcta **no** se envía al cliente hasta cerrar el ejercicio: el cliente recibe un `hashRespuesta` (SHA-256 de respuesta normalizada + `ejercicioId`) para validación local optimista en tipos de respuesta cerrada; para `numero_a_palabras` la validación es solo de servidor.

## 4. Registro de ejercicios
```ts
// modules/alumno/ejercicios/registry.ts
export const registroEjercicios: Record<TipoInteraccion, React.FC<EjercicioProps>> = {
  seleccion_multiple: EjercicioSeleccionMultiple,
  arrastrar: EjercicioArrastrar,           // dnd-kit, con alternativa por teclado/tap (RI-03)
  numero_a_palabras: EjercicioNumeroAPalabras,
  identificar_numero: EjercicioIdentificarNumero,
  suma_figuras: EjercicioSumaFiguras,
  completar_operacion: EjercicioCompletarOperacion,
  colorear_figura: EjercicioColorearFigura, // SVG + paleta de 8 colores con nombre y patrón
};
interface EjercicioProps {
  ejercicio: EjercicioPublico;      // sin respuesta
  deshabilitado: boolean;
  onResponder(respuesta: RespuestaEjercicio): void;
}
```
Agregar un tipo nuevo = componente + esquema Zod + validador + entrada en el enum (sin tocar el motor).

## 5. Captura emocional (`useEmotionCapture`)
```ts
useEmotionCapture({ activo, asignacionId, intervaloSeg = 10 })
```
- Requiere `auth.camara === true`; si no, no hace nada.
- `getUserMedia({ video: { width: 320, facingMode: 'user' }, audio: false })`.
- Solo captura si `document.visibilityState === 'visible'` y hay ejercicio activo.
- Dibuja en `OffscreenCanvas`/`canvas` oculto → `toBlob` → `POST /alumno/emociones/frame` → libera.
- Muestra indicador permanente "📷 Cámara activa" (transparencia hacia el alumno).
- Detiene tracks al desmontar o salir de la actividad.
- Respuesta del servidor puede traer `{ofrecerAyuda: true}` → muestra `PreguntaAyuda` (RF-27, lado alumno).

## 6. Alertas del docente (`useAlertasStream`)
`EventSource('/api/v1/docente/alertas/stream')` (cookie de sesión). Eventos: `alerta.nueva`, `alerta.atendida`, `ping`. Reconexión automática; si falla 3 veces → polling cada 15 s. Al recibir `alerta.nueva`: toast persistente + contador en la barra + sonido opcional.

## 7. UI e identidad visual (RI-01, RNF-06)
- Tokens en `styles/tokens.css` (`--color-primario`, `--color-exito`, `--radio`, `--fuente-titulo`, …) con tema claro/oscuro; el módulo alumno usa escala tipográfica mayor (base 20 px) y objetivos de 48 px.
- Fuente legible para niños (p. ej. *Andika* o *Atkinson Hyperlegible*).
- Cada pantalla del alumno: instrucción ≤ 8 palabras + ícono + `BotonAudio`.
- Animaciones con `prefers-reduced-motion`.
- axe-core sin violaciones serias en CI (P-A11Y-01).

## 8. Rendimiento (RNF-01)
- Code splitting por módulo (`lazy(() => import('modules/docente/...'))`): el alumno nunca descarga el bundle docente.
- Precarga del siguiente ejercicio mientras se resuelve el actual.
- Presupuesto: bundle inicial del alumno ≤ 250 KB gzip; LCP ≤ 2.5 s en 4G.
