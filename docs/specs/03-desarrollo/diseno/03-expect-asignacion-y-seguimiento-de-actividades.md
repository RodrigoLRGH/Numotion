# EXP-03 · Asignación y seguimiento de actividades (Módulo Docente)

**Cubre:** RF-56, RF-57, RF-58, RF-59 · **HU:** HU-08, HU-09, HU-10 · **Depende de:** EXP-01, EXP-02 (nivel inicial)

## Objetivo
Que el docente asigne actividades por tema y tipo de interacción a un grupo o a alumnos específicos, que cada alumno reciba su asignación con un nivel inicial basado en su diagnóstico, y que el docente vea el avance y el historial.

## Expectativas verificables

| ID | Se espera que… | Verificación |
|---|---|---|
| EXP-03.1 | El formulario (wizard 3 pasos) capture nombre, tema, tipo, fecha, n.º de ejercicios y destinatarios **excluyentes** (grupo **o** alumnos); la API rechace ambos o ninguno con 422. | P-COMP-04, P-API-01 |
| EXP-03.2 | Al confirmar, en **una transacción** se cree la actividad y una `asignacion_alumno` por destinatario con `nivel_inicial = fn_nivel_inicial` (2 si no hay diagnóstico, marcado `sinDiagnostico`). Para 40 alumnos tarde < 1 s. Duplicados imposibles. | P-API-01, P-DB-02, P-DB-06, P-PERF-03 |
| EXP-03.3 | El paso 3 muestre la previsualización del nivel inicial por alumno antes de confirmar. | P-COMP-04 |
| EXP-03.4 | La lista de actividades asignadas muestre por alumno estado (pendiente/en curso/completada), fecha y nivel inicial (y actual); se actualice cada 30 s o al recibir eventos. | P-API-04 |
| EXP-03.5 | El historial liste asignaciones completadas en orden cronológico descendente con fecha y resultado final, filtrable por alumno, tema y periodo, paginado por cursor. | P-API-04 |
| EXP-03.6 | Un docente no pueda asignar a alumnos/grupos ajenos (404) ni ver actividades de otros docentes. | P-SEC-01 |

## Componentes
- API: `modules/docente/actividades.{routes,service}.ts` → llama `fn_registrar_asignacion` dentro de `withContext`.
- Web: `modules/docente/pages/{NuevaActividad, ActividadesAsignadas, Historial}`, `components/{FormularioAsignacion, SelectorDestinatarios, TablaSeguimiento}`.

## Notas
- Esquema Zod del destino como unión discriminada → el tipo excluyente se garantiza también en compile time:
```ts
export const DestinoActividad = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('grupo'), grupoId: z.string().uuid() }),
  z.object({ tipo: z.literal('alumnos'), alumnoIds: z.array(z.string().uuid()).min(1).max(60) }),
]);
```
- Alumnos que se unan al grupo **después** de asignar no reciben la actividad automáticamente (documentar en UI); botón "Asignar a nuevos alumnos" como mejora futura.
