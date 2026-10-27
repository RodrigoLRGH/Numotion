# Pruebas de rendimiento y concurrencia (k6)

Entorno: `staging` con el mismo tamaño de instancia que producción (RDS db.t4g.medium o equivalente), datos de `perf/seed.sql` (20 grupos × 30 alumnos). Rekognition y OpenAI **mockeados** (servidor stub con latencia configurable: 300 ms y 5 s) para no generar costo (RC-04).

## P-PERF-01 · Interacción del alumno (RNF-01)
```js
// perf/interaccion.js
export const options = {
  scenarios: { clase: { executor: 'ramping-vus', stages: [
    { duration: '1m', target: 100 }, { duration: '5m', target: 300 }, { duration: '1m', target: 0 } ] } },
  thresholds: {
    'http_req_duration{name:intento}':   ['p(95)<2000', 'p(99)<3000'],
    'http_req_duration{name:siguiente}': ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
  },
};
export default function () {
  const s = loginAlumno();                                   // token pre-generado por VU
  const ej = get(`/alumno/actividades/${s.asig}/siguiente`, s, 'siguiente');
  sleep(randomBetween(5, 20));                               // tiempo de pensar
  post('/alumno/intentos', { clienteId: uuid(), asignacionId: s.asig, ejercicioId: ej.id,
        respuesta: respuestaAleatoria(ej), numeroIntento: 1, tiempoMs: 8000 }, s, 'intento');
  if (__ITER % 2 === 0) postFrame(s);                        // 1 frame cada ~2 iteraciones
}
```
Objetivo interno (no contractual): p95 ≤ 300 ms en `intento` con el stub.

## P-PERF-02 · Generación (RNF-02)
| Escenario | Umbral |
|---|---|
| `GET /alumno/ejercicios/:id/guia` con OpenAI stub a 5 s | p95 < 30 s (objetivo < 8 s) |
| `GET /docente/grupos/:id/resumen` con 40 alumnos | p95 < 30 s (objetivo < 2 s) |
| `GET /docente/grupos/:id/reportes/temas` periodo 3 meses | p95 < 30 s (objetivo < 3 s) |
| OpenAI stub con timeout (25 s) | Respuesta desde catálogo < 21 s |

## P-PERF-03 · Concurrencia (RF-57, RF-60, RF-67)
1. **Asignación + intentos simultáneos:** 30 VUs alumnos enviando intentos a sus asignaciones mientras 5 docentes crean actividades para grupos de 40 → 0 errores 5xx, 0 deadlocks (`pg_stat_database.deadlocks` sin cambio), cada actividad con exactamente N asignaciones.
2. **Mismo alumno, dos pestañas:** 2 VUs con el mismo token envían el mismo `clienteId` 50 veces → 1 sola fila de intento.
3. **Racha concurrente:** el mismo alumno completa 5 prácticas en paralelo → `racha_actual` incrementa exactamente 1 (gracias a `FOR UPDATE`).
4. **Último ejercicio concurrente:** dos intentos correctos simultáneos sobre el último ejercicio → la asignación queda `completada` una vez y un solo `resultado_academico`.

Verificación post-corrida:
```sql
SELECT actividad_id, count(*) FROM asignacion_alumno GROUP BY 1 HAVING count(*) <> :esperado;   -- vacío
SELECT asignacion_id, count(*) FROM resultado_academico WHERE asignacion_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1; -- vacío
```
Añadir `UNIQUE (asignacion_id)` parcial en `resultado_academico` si el caso 4 lo exige.

## Informe
k6 exporta `summary.json` → artefacto de CI; en PRs que tocan `modules/alumno` o `core/adaptive` se corre una versión corta (2 min, 50 VUs).
