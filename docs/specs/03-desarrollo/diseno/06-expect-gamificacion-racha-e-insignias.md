# EXP-06 · Gamificación: puntos, niveles, insignias, racha, perfil y mensaje motivacional

**Cubre:** RF-03, RF-22, RF-63 (secciones del panel), RF-65, RF-66, RF-67, RF-68 · **HU:** HU-19…HU-23 · **Depende de:** EXP-01, EXP-04

## Objetivo
Motivar la práctica constante con refuerzo positivo (puntos, niveles, personaje, insignias, racha), sin rankings ni comparaciones entre alumnos.

## Expectativas verificables

| ID | Se espera que… | Verificación |
|---|---|---|
| EXP-06.1 | Los puntos se otorguen según `02-…§4` (sin negativos), el nivel de gamificación se calcule con `50·n·(n−1)` y las insignias del catálogo se otorguen una sola vez cuando se cumpla su regla; al subir de nivel o ganar insignia se muestre una animación. | P-UNIT-09, P-E2E-01 |
| EXP-06.2 | La racha siga RF-67/RF-68 y A-15 exactamente (función y trigger de `02-…§2`), incluso con prácticas concurrentes. | P-DB-01 |
| EXP-06.3 | El panel muestre la racha actual (días) con representación visual de la semana (L–V) y la mejor racha; nunca muestre "perdiste tu racha" en tono negativo (usar "¡Empieza una nueva racha hoy!"). | P-COMP-03 |
| EXP-06.4 | El perfil muestre nombre, grado, grupo, personaje, nivel e insignias; **sin** datos emocionales ni de otros alumnos. | P-COMP-03, P-SEC-01 |
| EXP-06.5 | Al entrar al panel se muestre una frase motivacional elegida por `condicion` (estado inicial, racha) con `{nombre}` y `{racha}` sustituidos; sin repetir la misma frase dos días seguidos. | P-COMP-03 |
| EXP-06.6 | La práctica libre ofrezca juegos de los tipos disponibles por tema, de 5 ejercicios, con nivel = último `nivel_actual` del alumno en ese tema (o 2), y al completarse dispare la racha. | P-E2E-01 |

## Componentes
- API: `core/gamificacion/{puntos.ts, niveles.ts, insignias.ts}`, `modules/alumno/practica.routes.ts`.
- Web: `components/{RachaVisual, Insignias, Personaje, MensajeMotivacional, RecompensaModal}`, `pages/{PracticaLibre, PerfilAlumno}`.

## Evaluación de insignias
```ts
type Regla =
  | { tipo: 'asignaciones_completadas'; min: number }
  | { tipo: 'racha'; min: number }
  | { tipo: 'practicas_completadas'; min: number }
  | { tipo: 'tipos_juego_distintos'; min: number }
  | { tipo: 'ayuda_y_aciertos_seguidos'; aciertos: number }
  | { tipo: 'maestria_tema'; temaClave: string; asignaciones: number; resultadoMin: number };
export function evaluarInsignias(ctx: ContextoGamificacion, catalogo: Insignia[]): string[] /* claves nuevas */;
```
Se evalúa tras cada intento cerrado, asignación completada y práctica completada; `INSERT … ON CONFLICT DO NOTHING`.
