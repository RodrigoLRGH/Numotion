# Navegación con React Router y guardas por rol

> Equivalente al "Expo Router + guardas" del árbol de ejemplo. Si el inventario (T-00-01) revela Expo/React Native, se implementa la misma tabla con grupos `(docente)` y `(alumno)` de Expo Router y `<Redirect>` en cada `_layout.tsx`.

## 1. Mapa de rutas

| Ruta | Página | Guardas | RF |
|---|---|---|---|
| `/` | `Inicio` (elige "Soy maestra/o" / "Soy alumno/a") | Pública | — |
| `/consentimiento/:token` | `ConsentimientoTutor` | Pública | RNF-10 |
| **Docente** | | | |
| `/docente/entrar` | `LoginDocente` | `RedirectIfAuth` | RNF-04 |
| `/docente` | `PanelDocente` (resumen previo + alertas) | `RequireRole('docente')` | RF-14, RF-62, RF-16 |
| `/docente/grupos/:grupoId` | `DetalleGrupo` | docente | — |
| `/docente/alumnos/:alumnoId` | `FichaAlumno` (tabs: Resumen, Perfil estadístico, Cruce, Resultados, Notas) | docente | RF-29, RF-19, RF-52, RF-35, RF-50 |
| `/docente/actividades` | `ActividadesAsignadas` | docente | RF-58 |
| `/docente/actividades/nueva` | `NuevaActividad` (wizard 3 pasos) | docente | RF-56, RF-57 |
| `/docente/historial` | `Historial` | docente | RF-59 |
| `/docente/reportes` | `Reportes` | docente | RF-18 |
| `/docente/retroalimentaciones` | `Retroalimentaciones` | docente | RF-61, RF-62 |
| `/docente/retroalimentaciones/:retroId` | `Retroalimentacion` | docente | RF-61, RF-62 |
| `/admin` | `SolicitudesArco` | admin | RC-07, RC-08 |
| `/docente/alertas/:alertaId` | `DetalleAlerta` + `GuiaActuacion` | docente | RF-27 |
| **Alumno** | | | |
| `/alumno/entrar` | `EntrarAlumno` (código → avatar → PIN) | `RedirectIfAuth` | ADR-004 |
| `/alumno/sin-permiso` | `SinConsentimiento` | Pública | RNF-10 |
| `/alumno/diagnostico/emocional` | `PanasC` | `RequireRole('alumno')` + `RequireConsent` | RF-54 |
| `/alumno/diagnostico/matematico` | `DiagnosticoMatematico` | alumno + consent + `RequirePanas` | RF-55 |
| `/alumno` | `PanelAlumno` | alumno + consent + **`RequireDiagnosticos`** | RF-63, RF-22, RF-66 |
| `/alumno/actividades` | `MisActividades` | igual que `/alumno` | RF-64 |
| `/alumno/actividades/:asignacionId` | `ResolverActividad` | igual + `CameraPermissionGate` | RF-60, RF-10 |
| `/alumno/practica` · `/alumno/practica/:practicaId` | `PracticaLibre` | igual que `/alumno` | RF-67 |
| `/alumno/perfil` | `PerfilAlumno` | igual que `/alumno` | RF-65 |
| `*` | `NoEncontrado` | — | — |

## 2. Definición del router

```tsx
// app/router.tsx
export const router = createBrowserRouter([
  { path: '/', element: <Inicio /> },
  { path: '/consentimiento/:token', element: <ConsentimientoTutor /> },
  {
    path: '/docente',
    lazy: () => import('../modules/docente/DocenteLayout'),       // code splitting por módulo
    children: [
      { path: 'entrar', element: <RedirectIfAuth><LoginDocente /></RedirectIfAuth> },
      { element: <RequireRole role="docente" />, children: [
          { index: true, lazy: () => import('../modules/docente/pages/PanelDocente') },
          { path: 'grupos/:grupoId', lazy: … },
          { path: 'alumnos/:alumnoId', lazy: … },
          { path: 'actividades', lazy: … },
          { path: 'actividades/nueva', lazy: … },
          { path: 'historial', lazy: … },
          { path: 'reportes', lazy: … },
          { path: 'alertas/:alertaId', lazy: … },
      ]},
    ],
  },
  {
    path: '/alumno',
    lazy: () => import('../modules/alumno/AlumnoLayout'),
    children: [
      { path: 'entrar', element: <RedirectIfAuth><EntrarAlumno /></RedirectIfAuth> },
      { path: 'sin-permiso', element: <SinConsentimiento /> },
      { element: <RequireRole role="alumno" />, children: [
        { element: <RequireConsent />, children: [
          { path: 'diagnostico/emocional', lazy: … },
          { element: <RequirePanas />, children: [{ path: 'diagnostico/matematico', lazy: … }] },
          { element: <RequireDiagnosticos />, children: [
              { index: true, lazy: … },               // PanelAlumno
              { path: 'actividades', lazy: … },
              { path: 'actividades/:asignacionId', lazy: … },
              { path: 'practica', lazy: … },
              { path: 'practica/:practicaId', lazy: … },
              { path: 'perfil', lazy: … },
          ]},
        ]},
      ]},
    ],
  },
  { path: '*', element: <NoEncontrado /> },
]);
```

## 3. Guardas

| Guarda | Condición | Si falla |
|---|---|---|
| `RequireRole(role)` | `auth.status === 'authenticated' && auth.role === role` | Rol distinto → `/{suRol}`; sin sesión → `/{role}/entrar?next=…` |
| `RedirectIfAuth` | Sin sesión | Con sesión → `/docente` o `/alumno` |
| `RequireConsent` | `auth.consentimientoVigente` | `/alumno/sin-permiso` |
| `RequirePanas` | `sesion.panasCompleto` | `/alumno/diagnostico/emocional` |
| `RequireDiagnosticos` | `sesion.panasCompleto && sesion.diagnosticoCompleto` | Al primer diagnóstico pendiente |
| `CameraPermissionGate` | Si `camaraPermitida`: pide permiso; si se niega, continúa en modo sin cámara con aviso al docente | Nunca bloquea (ADR-009) |

```tsx
export function RequireDiagnosticos() {
  const { sesion } = useAuth();
  if (!sesion.panasCompleto) return <Navigate to="/alumno/diagnostico/emocional" replace />;
  if (!sesion.diagnosticoCompleto) return <Navigate to="/alumno/diagnostico/matematico" replace />;
  return <Outlet />;
}
```
- Las guardas del cliente son UX; **la API vuelve a validar** (403 `DIAGNOSTICOS_PENDIENTES`, 403 `CONSENTIMIENTO_REQUERIDO`). `http.ts` traduce esos códigos a la navegación correspondiente.
- El cambio de día (medianoche local) invalida `sesion` → la siguiente petición devuelve `DIAGNOSTICOS_PENDIENTES` y el alumno vuelve a diagnóstico.

## 4. Layouts
- `DocenteLayout`: barra lateral (Panel, Actividades, Historial, Reportes), selector de grupo, campana de alertas (SSE vivo en todo el módulo).
- `AlumnoLayout`: barra superior grande con personaje, puntos y botón "Salir"; sin menú complejo; botón "Inicio" siempre visible; indicador de cámara cuando está activa.
