# Casos de uso principales

Actores: **Docente**, **Alumno**, **Tutor** (consentimiento), **Rekognition** (sistema externo), **OpenAI** (sistema externo), **Reloj** (eventos por tiempo).

```
                 ┌──────────────────────── Numotion ────────────────────────┐
  Tutor ────────►│ CU-11 Otorgar consentimiento                              │
                 │                                                           │
  Docente ──────►│ CU-01 Iniciar sesión     CU-03 Ver retroalimentación      │
                 │ CU-04 Asignar actividad  CU-05 Seguimiento e historial    │
                 │ CU-07b Atender alerta    CU-08 Consultar alumno           │
                 │ CU-09 Reportes grupales                                   │
                 │                                                           │
  Alumno ───────►│ CU-01 Iniciar sesión     CU-02 Diagnósticos de sesión     │
                 │ CU-06 Resolver actividad CU-10 Gamificación / práctica    │
                 │          │ «include»                                      │
                 │          ▼                                                │
                 │ CU-07a Detectar emoción ─────────────────────────────────►│── Rekognition
                 │ CU-06 «extend» Generar ejercicio ────────────────────────►│── OpenAI
                 └───────────────────────────────────────────────────────────┘
```

---

## CU-01 · Iniciar sesión
**Actores:** Docente, Alumno · **RF/RNF:** RNF-04, RC-07, ADR-004
**Flujo docente:** 1) Ingresa correo y contraseña. 2) El sistema valida, emite token (rol `docente`) y registra en auditoría. 3) Redirige a `/docente` (CU-03).
**Flujo alumno:** 1) Escribe código de grupo. 2) Elige su avatar. 3) Toca su PIN de 4 íconos. 4) El sistema verifica consentimiento vigente (CU-11). 5) Emite token (rol `alumno`) y crea/reanuda la `sesion_alumno` del día. 6) Redirige a diagnósticos (CU-02) o al panel si ya los completó hoy.
**Alternos:** A1 credenciales inválidas → mensaje genérico; 5 fallos → bloqueo 5 min. A2 sin consentimiento → pantalla "Pide a tu maestra/o que active tu cuenta" y aviso al docente.

## CU-02 · Realizar diagnósticos de sesión
**Actor:** Alumno · **RF:** RF-54, RF-55, RF-61, RF-63
**Precondición:** sesión del día iniciada; PANAS-C o diagnóstico pendiente.
**Flujo:** 1) El sistema muestra PANAS-C, un ítem por pantalla con escala pictográfica de 5 caras y audio. 2) El alumno responde todos los ítems. 3) El sistema calcula AP y AN y los guarda. 4) Muestra el diagnóstico matemático (preguntas por tema del grado). 5) El alumno responde; se guarda el nivel de dominio por tema. 6) El sistema **genera la retroalimentación** (triangulación) y desbloquea el panel (RF-63).
**Alternos:** A1 el alumno sale a la mitad → al volver se retoma desde el último ítem respondido. A2 ya existe diagnóstico matemático de los últimos 7 días → el sistema aplica una versión corta (1 pregunta por tema) (configurable).
**Postcondición:** `retroalimentacion` creada para (alumno, sesión).

## CU-03 · Consultar retroalimentación y resumen previo
**Actor:** Docente · **RF:** RF-14, RF-62
**Flujo:** 1) Al abrir el panel, el sistema muestra la tarjeta "Cómo llega tu grupo hoy": distribución de estado emocional inicial (positivo/neutral/negativo), AP/AN promedio y alumnos sin diagnóstico. 2) Lista por alumno con el último estado, AP, AN y dominio por tema. 3) El docente abre el detalle de un alumno (→ CU-08).

## CU-04 · Asignar actividad
**Actor:** Docente · **RF:** RF-56, RF-57
**Flujo:** 1) Abre "Nueva actividad". 2) Indica nombre, tema, tipo de interacción, fecha de asignación y número de ejercicios (default 10). 3) Elige destinatarios: **grupo completo** o **alumnos específicos** (excluyente). 4) Revisa el resumen (incluye nivel inicial sugerido por alumno). 5) Confirma. 6) El sistema crea la actividad y una `asignacion_alumno` por destinatario con `nivel_inicial` (función `fn_nivel_inicial`), en una transacción.
**Alternos:** A1 alumno sin diagnóstico del tema → nivel inicial 2 y marca "sin diagnóstico". A2 lista de alumnos vacía → error de validación. A3 alumno fuera del grupo del docente → 403.

## CU-05 · Dar seguimiento a actividades e historial
**Actor:** Docente · **RF:** RF-58, RF-59
**Flujo:** 1) Lista de actividades asignadas con progreso (pendiente/en curso/completada por alumno) y nivel inicial. 2) Historial cronológico de finalizadas con resultado, filtrable por alumno, tema y periodo.

## CU-06 · Resolver actividad adaptativa
**Actor:** Alumno · **RF:** RF-60, RF-64, RF-01, RF-21, RF-10, RF-39–RF-44, RF-47, RF-11, RF-45, RF-03
**Precondición:** panel desbloqueado; asignación pendiente o en curso.
**Flujo:** 1) El alumno abre la actividad desde su panel. 2) El sistema solicita la cámara (si hay consentimiento de cámara) e inicia CU-07a. 3) Presenta el ejercicio del nivel actual. 4) El alumno responde. 5) El sistema valida, registra intento (respuesta, correcta, tiempo, número de intento) y otorga puntos si es correcto. 6) El motor adaptativo evalúa y, si corresponde, cambia el nivel (registrando el motivo). 7) Repite hasta completar N ejercicios. 8) Marca la asignación como completada y muestra recompensa.
**Alternos:** A1 respuesta incorrecta → retroalimentación positiva, nuevo intento (máximo 3 por ejercicio). A2 botón "Ayuda" → guía paso a paso (RF-11). A3 3.er intento fallido → el ejercicio se cierra con la guía paso a paso y la respuesta correcta (RF-11, RF-45). A4 el alumno sale → se retoma en el ejercicio vigente; la asignación está `en_curso` desde que completó su primer ejercicio (RF-72). A5 sin conexión → los intentos se encolan localmente y se sincronizan.

## CU-07a · Detectar emoción (incluido en CU-06)
**Actores:** Alumno, Rekognition · **RF/RI:** RI-02, RI-06, RNF-03, RC-05
**Flujo:** 1) Cada `REKOGNITION_SAMPLE_SECONDS` (default 10) mientras la pestaña está visible y hay ejercicio activo, se captura un frame. 2) Se envía al backend. 3) El backend llama a Rekognition con bytes, descarta la imagen y guarda solo la emoción dominante, su confianza y el estado derivado. 4) El backend recalcula el Índice de Frustración y lo entrega al motor adaptativo.
**Alternos:** sin rostro detectado → `sin_rostro`, no afecta el nivel. Error de Rekognition → se ignora la muestra (la adaptación sigue con desempeño).

## CU-07b · Atender alerta de frustración
**Actor:** Docente · **RF:** RF-16, RF-27
**Flujo:** 1) El IF de un alumno supera el umbral → se crea una alerta y se envía por SSE al docente. 2) El docente ve un aviso con el nombre del alumno, tema y señales. 3) Abre la guía de actuación paso a paso. 4) Marca la alerta como atendida (opcionalmente agrega una nota, RF-50).
**Paralelo en el alumno:** el sistema le pregunta "¿Quieres que te ayude?" → si acepta, abre la guía del ejercicio y baja un nivel.

## CU-08 · Consultar información del alumno
**Actor:** Docente · **RF:** RF-29, RF-19, RF-50, RF-52 (RF-35 se retiró de la matriz; la captura se conserva)
**Flujo:** 1) Abre la ficha del alumno. 2) Ve perfil estadístico (tiempo promedio, intentos, tipos de error, habilidades de menor dominio), estado emocional reciente, resultados consolidados por tema, cruce por tema entre el dominio del diagnóstico matemático y el AP/AN del PANAS-C de la misma sesión (RF-52), y notas. 3) Agrega una nota rápida o captura una calificación externa (tarea/trabajo/interrogación).

## CU-09 · Generar reportes grupales
**Actor:** Docente · **RF:** RF-18 · **RNF:** RNF-02
**Flujo:** 1) Elige grupo, opcionalmente un alumno, y periodo. 2) El sistema muestra por tema y subtema los ejercicios, aciertos, errores e índice de error, ordenados por índice de error (RF-18, A-39).

## CU-10 · Gamificación y práctica libre
**Actor:** Alumno · **RF:** RF-03, RF-22, RF-63, RF-65, RF-66, RF-67, RF-68
**Flujo:** 1) Al entrar al panel ve un mensaje motivacional (RF-22), su racha y sus insignias. 2) Abre una actividad lúdica de práctica libre y la completa. 3) El sistema suma puntos y, si es la primera práctica completada del día hábil, incrementa la racha; actualiza la mejor racha; evalúa insignias. 4) Puede ver su perfil (nombre, grado, grupo, nivel, insignias).

## CU-11 · Otorgar consentimiento parental
**Actores:** Docente, Tutor · **RNF/RC:** RNF-10, RC-07, RC-08
**Flujo:** 1) El docente da de alta al alumno con el correo del tutor. 2) El sistema envía al tutor un enlace único (válido 7 días) con el aviso de privacidad. 3) El tutor lee, confirma su identidad (nombre + parentesco + código de un solo uso enviado al correo) y acepta: uso de la plataforma (obligatorio) y uso de cámara (opcional). 4) El sistema registra el consentimiento con versión de aviso, fecha, IP y método. 5) El tutor puede revocar en cualquier momento desde el mismo enlace (derechos ARCO).
