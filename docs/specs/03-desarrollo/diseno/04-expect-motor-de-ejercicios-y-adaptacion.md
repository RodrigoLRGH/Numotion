# EXP-04 · Motor de ejercicios, adaptación de dificultad y solución guiada (Módulo Alumno + Core)

**Cubre:** RF-64, RF-60, RF-10, RF-39, RF-40, RF-41, RF-42, RF-44, RF-47, RF-01, RF-21, RF-11, RF-45, RNF-01, RNF-02, RI-03, RI-05, RI-07 · **HU:** HU-11…HU-15 · **Depende de:** EXP-01, EXP-02, EXP-03

## Objetivo
Que el alumno resuelva sus actividades en ejercicios interactivos de distintos tipos, que cada intento quede registrado con su tiempo, que la dificultad se ajuste automáticamente dentro del tema (1–5) según desempeño y emoción, y que reciba ayuda paso a paso cuando la necesite.

## Expectativas verificables

| ID | Se espera que… | Verificación |
|---|---|---|
| EXP-04.1 | "Mis actividades" liste las asignaciones del alumno con nombre, tema, tipo, fecha y estado; permita **empezar** pendientes y **continuar** en curso desde el siguiente ejercicio no resuelto. | P-API-02, P-E2E-01 |
| EXP-04.2 | Exista un componente por `tipo_interaccion` registrado en `registroEjercicios`; todos operables con táctil, mouse **y** teclado; objetivos ≥ 48 px; instrucción con audio. | P-COMP-01, P-A11Y-01 |
| EXP-04.3 | Los tipos cumplan su regla específica: RF-39 tolerancia `02-…`/A-07; RF-40 números no consecutivos (ningún par con diferencia 1); RF-41 total = suma de los grupos; RF-42 faltante en cualquier posición para +, −, ×, ÷ (división exacta); RF-44 coloreo correcto = figura objetivo con color objetivo y ninguna otra figura con ese color. | P-UNIT-03, P-UNIT-04, P-UNIT-08 |
| EXP-04.4 | Cada intento registre respuesta, `correcta`, `tipo_error`, `numero_intento`, `tiempo_ms` (desde que el ejercicio se muestra hasta que se envía, excluyendo tiempo con la pestaña oculta) e idempotencia por `clienteId`; la asignación pase a `en_curso` / `completada` por trigger. | P-API-02, P-DB-03 |
| EXP-04.5 | `decidirNivel` implemente exactamente la tabla `02-…§3.4`; el nivel nunca salga de [1,5] ni cambie de tema; cada cambio se registre en `ajuste_dificultad` con motivo y señales. | P-UNIT-01, P-DB-05 |
| EXP-04.6 | La guía paso a paso (RF-11) se abra a petición o tras el 3.er fallo, revelando un paso a la vez; la explicación final (RF-45) aparezca al cerrar un ejercicio sin acierto, con la respuesta correcta. Ambas en ≤ 30 s (catálogo: ≤ 300 ms). | P-COMP-02, P-API-02, P-PERF-02 |
| EXP-04.7 | Si `OPENAI_ENABLED`, se puedan generar ejercicios contextualizados a los intereses del alumno (sin PII en el prompt); el ejercicio generado se valide (respuesta calculable y en rango del nivel) antes de usarse; ante error, timeout de 20 s o presupuesto agotado se use el catálogo. | P-INT-02 |
| EXP-04.8 | Toda interacción del alumno tenga retroalimentación visual ≤ 100 ms (validación optimista) y confirmación del servidor p95 ≤ 2 s. | P-PERF-01 |
| EXP-04.9 | Sin conexión, los intentos se encolen y se sincronicen al reconectar sin duplicarse; el alumno vea "Guardando…" en lugar de un error. | P-E2E-05 |
| EXP-04.10 | Al completar la actividad se muestre la recompensa (puntos, estrellas, insignias nuevas) y se cree el `resultado_academico` de tipo `actividad_numotion`. | P-E2E-01, P-DB-03 |

## Flujo del servicio `registrarIntento` (API)
```
withContext(alumno) {
  1. validar asignación propia y no completada; idempotencia por clienteId
  2. ejercicio ← cargar; correcta ← validar(tipo, respuesta, ejercicio.respuesta)
  3. INSERT intento_ejercicio  (trigger avanza asignación)
  4. puntos ← reglaPuntos(numeroIntento, guía)  → UPDATE asignacion.puntaje, perfil_gamificacion
  5. si ejercicio cerrado:
       señales ← ultimos3, erroresConsecutivos, estadoVentana (EXP-05), IF
       {nivelNuevo, motivo} ← decidirNivel(señales)
       si cambió → UPDATE nivel_actual; INSERT ajuste_dificultad
  6. guía ← si numeroIntento == 3 && !correcta → paso_a_paso; si cerrado && !correcta → final
  7. evaluarInsignias()
  8. evaluarAlerta(IF)  (EXP-05.5)
  9. siguiente ← seleccionarEjercicio(tema, nivelActual, excluir ya vistos en la asignación)
}
```

## Selección del siguiente ejercicio
1. Mismo `tema_id` que la actividad y `tipo_interaccion` de la actividad (RF-21).
2. `nivel = nivel_actual`.
3. Excluir ejercicios ya presentados en la asignación; si se agotan, permitir repetición del menos reciente.
4. Si el tema no tiene ejercicios del tipo/nivel → nivel adyacente más cercano y registrar `warn` (falta contenido).

## Clasificación de `tipo_error` (RF-19)
| Tipo de ejercicio | Regla |
|---|---|
| completar_operacion / selección | Opción elegida = resultado de otra operación (p. ej. sumó en vez de restar) → `procedimiento`; diferencia ±1 o ±10 → `calculo`; otro → `seleccion` |
| numero_a_palabras | Distancia ≤ 3 → `ortografia`; si corresponde a otro número → `lectura` |
| suma_figuras | ±1 → `calculo` (conteo) |
| colorear_figura | Figura incorrecta → `lectura`; color incorrecto → `seleccion` |
| Inactividad > 120 s sin respuesta | `tiempo_agotado` (solo registro, no cierra) |

## Fuera de alcance
Editor de ejercicios para el docente (el catálogo se carga por seed/admin).
