# Pruebas de rutas y guardas (React Router)

Se prueban con `createMemoryRouter` + `RouterProvider` y un `AuthProvider` falso.

```tsx
function renderRuta(path: string, auth: Partial<AuthState>) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<FakeAuthProvider value={auth}><RouterProvider router={router} /></FakeAuthProvider>);
  return router;
}
```

## P-ROUTE-01 · Rol
| Estado | Ruta | Destino esperado |
|---|---|---|
| sin sesión | `/docente` | `/docente/entrar?next=%2Fdocente` |
| sin sesión | `/alumno` | `/alumno/entrar?next=%2Falumno` |
| docente | `/alumno` | `/docente` |
| alumno | `/docente/reportes` | `/alumno` |
| docente | `/docente/entrar` | `/docente` (RedirectIfAuth) |

## P-ROUTE-02 · Diagnósticos (RF-63)
| `panasCompleto` | `diagnosticoCompleto` | Ruta | Destino |
|---|---|---|---|
| false | false | `/alumno` | `/alumno/diagnostico/emocional` |
| true | false | `/alumno/actividades/x` | `/alumno/diagnostico/matematico` |
| false | false | `/alumno/diagnostico/matematico` | `/alumno/diagnostico/emocional` |
| true | true | `/alumno` | `/alumno` (PanelAlumno visible) |
| true | true → API responde 403 `DIAGNOSTICOS_PENDIENTES` (cambio de día) | `/alumno` | `/alumno/diagnostico/emocional` |

## P-ROUTE-03 · Consentimiento
| `consentimientoVigente` | Ruta | Destino |
|---|---|---|
| false | `/alumno/diagnostico/emocional` | `/alumno/sin-permiso` |
| true, `camaraPermitida=false` | `/alumno/actividades/x` | Página de actividad **sin** solicitud de cámara |

## Code splitting
Prueba en Playwright (P-PERF-01 auxiliar): al navegar como alumno, ninguna petición de red carga chunks cuyo nombre contenga `docente`.
