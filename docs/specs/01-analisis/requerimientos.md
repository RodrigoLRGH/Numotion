# 01 · Análisis — Requerimientos normalizados

Fuente: Matriz de Clasificación actualizada (`requerimientos_act.pdf`, revisada el 2026-11-26; antes `docs/requerimientos.docx`). Los IDs **no se renumeran**. Aquí se agrupan por módulo, se fijan criterios verificables y se resuelven ambigüedades.

**Cambios de la matriz actualizada:** se retiraron **RF-35** (consolidar resultados) y **RF-44** (colorear figuras); **RF-22, RF-40 y RF-41** pasan a *Must*; se redefinieron **RF-03, RF-11, RF-39 y RF-52** y se agregaron **RF-69 a RF-72**. Las decisiones de alcance tomadas con el equipo para esta versión están en A-33 a A-43.

**Fuera del MVP (decisión del equipo, 2026-11-26, migración `0015_alcance_mvp.sql`):** RC-07 (administrador y derechos ARCO, auditoría de accesos y purga de datos emocionales) y las alertas al docente (RF-16 y la parte docente de RF-27). Ver A-41 a A-43.

**De vuelta en el MVP (2026-11-27, migración `0016_consentimiento_tutor.sql`):** RC-08 y RNF-10, con el consentimiento verificable del tutor y el aviso de privacidad versionado. Ver A-44.

## 1. Requerimientos funcionales por módulo

### 1.1 Módulo Alumno
| ID | Nombre | Criterio verificable (resumen) | MoSCoW |
|---|---|---|---|
| RF-54 | Diagnóstico emocional PANAS-C | Cuestionario asignado al iniciar la sesión; registra afecto positivo (AP) y negativo (AN) | Must |
| RF-55 | Diagnóstico matemático | Preguntas por tema; registra nivel de dominio 1–5 por tema. Completo cada día (sin versión corta, A-19) | Must |
| RF-69 | Registrar resultado PANAS-C | Guarda AP y AN al completar el cuestionario; consultable por el docente | Must |
| RF-70 | Registrar dominio del diagnóstico | Calcula y guarda el nivel de dominio por tema al responder todas las preguntas | Must |
| RF-63 | Panel principal | Accesible **solo** con RF-54 y RF-55 completos en la sesión del día; enlaza a actividades, perfil, racha/insignias, práctica libre | Must |
| RF-64 | Actividades asignadas | Lista con nombre, tema, tipo, fecha, estado; abre pendientes y retoma en curso | Must |
| RF-60 | Responder ejercicios | El alumno responde los ejercicios de una actividad pendiente o en curso | Must |
| RF-71 | Registrar respuestas | Guarda cada respuesta, si fue correcta, y marca el ejercicio como completado | Must |
| RF-72 | Registrar avance | "En curso" al **completarse el primer ejercicio** (acierto o intentos agotados); "completada" al cerrar todos (A-37) | Must |
| RF-10 | Actividades interactivas | Organizadas por tema; cada actividad usa ≥ 1 tipo de interacción (arrastrar o selección múltiple, ampliado por A-05) | Must |
| RF-39 | Escribir números en palabras | **Serie** de números, cada uno con su campo de texto; tolerancia ortográfica menor por número (A-07, A-33) | Must |
| RF-40 | Identificar número | Números aleatorios no consecutivos; seleccionar el solicitado | Must |
| RF-41 | Sumar con figuras | Dos o más conjuntos de figuras + campo numérico del total | Must |
| RF-42 | Completar operación | Operación con faltante + opciones múltiples; +, −, ×, ÷ | Must |
| RF-11 | Solución guiada | A petición o al agotar los intentos: **máximo 3 intentos** por ejercicio (A-16) | Must |
| RF-45 | Guía por fallo | Explicación y solución correcta al fallar el ejercicio (A-03) | Must |
| RF-47 | Tiempo de resolución | `tiempo_ms` por intento y por ejercicio | Must |
| RF-03 | Gamificación | Práctica de operaciones con niveles, puntos y recompensas visuales; los temas con dominio insuficiente se muestran primero como recomendados (A-35) | Must |
| RF-65 | Perfil | Nombre, grado, grupo, nivel de gamificación, insignias; **sin datos emocionales** | Must |
| RF-66 | Racha e insignias | Racha actual (días) visual + insignias; sin rankings | Must |
| RF-67 | Calcular racha | Días hábiles consecutivos con ≥ 1 práctica libre completada; fines de semana no rompen | Must |
| RF-68 | Conservar mejor racha | `mejor_racha` nunca disminuye | Must |
| RF-22 | Mensaje motivacional | Frase personalizada al iniciar, a partir de la **identidad** y el **historial académico** (A-36) | Must |

Retirado de la matriz: **RF-44** (colorear figuras). El tipo "Colorea la figura" se conserva en el catálogo como mecánica adicional (A-12).

### 1.2 Módulo Docente
| ID | Nombre | Criterio verificable (resumen) | MoSCoW |
|---|---|---|---|
| RF-14 | Resumen previo emocional | Al entrar, AP/AN del PANAS-C por alumno y del grupo, de la interacción más reciente | Must |
| RF-61 | Crear retroalimentación | Por alumno, triangulando **solo** PANAS-C + diagnóstico matemático (A-01) | Must |
| RF-62 | Visualizar retroalimentación | PANAS-C + métricas por tema del diagnóstico, por alumno y grupo | Must |
| RF-56 | Asignar actividad | Nombre, tema, tipo, fecha, destinatarios: grupo **o** alumnos (excluyente) | Must |
| RF-57 | Registrar asignación | Una asignación por alumno con nivel inicial basado en PANAS-C + diagnóstico | Must |
| RF-58 | Actividades asignadas | Lista con estado por alumno, fecha y nivel inicial | Must |
| RF-59 | Historial | Actividades finalizadas, cronológico, por alumno y grupo, filtros por alumno/tema/periodo | Must |
| RF-16 | Alerta temprana de frustración | Alerta al docente en < 2 s antes del abandono. **Fuera del MVP**: no hay alertas al docente (A-38) | Must |
| RF-27 | Guía de actuación | Solo la parte del alumno: se le pregunta si quiere ayuda y, si acepta, se abre la guía paso a paso del ejercicio. La guía de actuación para el docente queda **fuera del MVP** (A-34) | Must |
| RF-29 | Consultar estudiante | Desempeño, estado emocional reciente (PANAS-C del último diagnóstico y lecturas de la última sesión con cámara; sin histórico por fechas), notas | Must |
| RF-19 | Perfil estadístico | Tiempo, intentos, tipos de error, habilidades de menor dominio | Must |
| RF-18 | Reporte de índice de error | Temas/subtemas ordenados por **índice de error** a nivel grupal (A-39) | Must |
| RF-50 | Notas rápidas | Fecha automática, texto libre, etiqueta opcional | Must |
| RF-52 | Cruce académico-emocional | Por tema: **dominio del diagnóstico matemático** vs **AP/AN del PANAS-C** de la misma sesión, cuando existen ambos (A-40) | Must |

Retirado de la matriz: **RF-35** (consolidar resultados). La captura de tareas, trabajos e interrogaciones se conserva en la ficha del alumno, pero ya no alimenta el cruce (A-10).

### 1.3 Núcleo (core)
| ID | Nombre | Criterio verificable |
|---|---|---|
| RF-01 | Adaptar por emoción | Nivel ∈ [1,5]; baja cuando una emoción negativa (frustración, ansiedad o enojo) persiste |
| RF-21 | Adaptar automáticamente | Desempeño + emoción, dentro del mismo tema |

## 2. No funcionales, interfaz y restricciones

| ID | Criterio verificable | Verificación |
|---|---|---|
| RNF-01 | p95 ≤ 2 s en interacciones del alumno | k6 + Playwright (P-PERF-01) |
| RNF-02 | p95 ≤ 30 s en guía, resumen grupal, generación | k6 (P-PERF-02) |
| RNF-03 | Imagen facial solo en memoria durante la sesión | Auditoría + prueba P-SEC-03 |
| RNF-04 | Docente autenticado; solo ve su grupo | P-SEC-01, P-DB-04 |
| RNF-06 | 90 % de éxito, 10 alumnos, sin instrucción | Prueba de usabilidad (P-UX-01) |
| RNF-10 | Cumplir con la normativa de protección de datos de menores: el sistema debe cumplir con la normativa aplicable de protección de datos personales de menores de edad, incluyendo consentimiento verificable de padres o tutores previo al uso del sistema por parte del estudiante (A-44) | Revisión legal del flujo de consentimiento y del aviso de privacidad antes del despliegue en una institución; P-SEC-04, P-E2E-01 |
| RI-01 | Web, identidad visual, WCAG 2.1 AA | axe-core en Playwright (P-A11Y-01) |
| RI-02 / RC-03 | Cámara por alumno, activa durante la actividad para **todos** los alumnos con consentimiento del tutor (A-41, A-44) | P-E2E-04 (permiso/negación) |
| RI-03 | Táctil, mouse o teclado | Pruebas de interacción por puntero y teclado |
| RI-05 | Internet estable | Manejo offline: cola local de intentos (EXP-04.9, P-E2E-05) |
| RI-06 | Rekognition sin almacenar imagen | P-INT-01 (mock) + P-SEC-03 |
| RI-07 | OpenAI con respaldo | P-INT-02 |
| RI-09 | HTTPS en todo | HSTS + redirección; P-SEC-05 |
| RC-01 | Sin modelos propios | Revisión de arquitectura |
| RC-02 | AWS | IaC / despliegue |
| RC-04 | Presupuesto limitado | Métricas de llamadas; topes configurables |
| RC-05 | Sin biométricos almacenados | = RNF-03 |
| RC-07 | LFPDPPP: cifrado, roles, auditoría, aviso, ARCO | **Fuera del MVP** (A-41). Se conservan el control de acceso por rol (RNF-04), HTTPS (RI-09), el aviso de privacidad versionado y la página «Aviso de privacidad» |
| RC-08 | El sistema debe cumplir con los principios de protección de datos de menores establecidos en la Ley General de los Derechos de Niñas, Niños y Adolescentes, incluyendo el consentimiento de madres, padres o tutores para el tratamiento de datos del estudiante (A-44) | = RNF-10 |

## 3. Ambigüedades e inconsistencias detectadas

| ID | Hallazgo | Interpretación adoptada (vigente hasta validar) |
|---|---|---|
| A-01 | **RF-61** "Crear la retroalimentación" tiene la misma descripción que RF-63 (copiada). | RF-61 = el sistema **genera y guarda** un registro de retroalimentación por alumno y sesión al completar PANAS-C + diagnóstico (triangulación). RF-63 = panel del alumno. |
| A-02 | **RF-01** y **RF-21** se solapan. | Un solo motor adaptativo. RF-01 cubre el factor emocional; RF-21 la combinación desempeño + emoción dentro del tema. |
| A-03 | **RF-11** y **RF-45** se solapan (la propia matriz lo advierte). | RF-11: **ayuda a petición** durante el ejercicio (botón "Ayuda") con pasos progresivos. Al 3.er fallo el ejercicio se cierra y se muestran juntos RF-11 y RF-45: la guía paso a paso completa y la respuesta correcta. *(Actualizado el 2026-11-26: antes había un 4.º intento.)* |
| A-04 | **RF-27** dice que la guía es para el docente pero "pregunta al alumno si desea recibirla". | Dos piezas: (a) al docente: guía de actuación paso a paso ligada a la alerta; (b) al alumno: mensaje "¿Quieres que te ayude?" que, si acepta, abre RF-11 y una pausa activa breve. |
| A-05 | **RF-10** limita a "arrastrar o selección múltiple", pero RF-39 (texto), RF-41 (campo) y el coloreo usan otras. RF-56 repite la limitación. | Enum `tipo_interaccion` con 7 valores (ver modelo de datos). El docente elige el tipo al asignar; RF-10 se cumple porque cada actividad tiene ≥ 1 tipo. **Confirmado con el equipo (2026-11-26):** RF-56 conserva los tipos adicionales. |
| A-06 | **RF-66** cita "RF-09" (gestión pedagógica de la competencia), inexistente en la matriz. | Se ignora la referencia; se aplica el principio "sin rankings ni comparaciones". Validar si RF-09 fue eliminado. |
| A-07 | **RF-39** "tolerancia de errores ortográficos menores" no está cuantificada. | Normalizar (minúsculas, sin acentos, espacios simples) y aceptar distancia de Levenshtein ≤ 1 por cada 8 caracteres de la respuesta esperada (mín. 1). |
| A-08 | **RF-16** no define "señales de frustración". | Índice de frustración (IF) ∈ [0,1] combinando emoción, errores consecutivos, inactividad y ayudas (ver 02-diseno §3.3). Alerta si IF ≥ 0.6 sostenido en 2 evaluaciones. |
| A-09 | **RF-14** "antes de iniciar la sesión de clases" y "interacción más reciente". | Al abrir el panel docente se muestra el último registro de retroalimentación de cada alumno (y del grupo agregado); se marca "sin datos hoy" si el alumno aún no ha hecho diagnóstico en el día. |
| A-10 | **RF-35** habla de tareas, trabajos e interrogaciones que **no se generan en el sistema**. | El docente los captura manualmente (calificación 0–10 por tema); las actividades de Numotion se consolidan automáticamente junto a ellos. *(RF-35 se retiró de la matriz el 2026-11-26: la captura se conserva en la ficha, pero ya no alimenta el cruce de RF-52.)* |
| A-11 | **Plan de negocios** dice que el procesamiento facial ocurre "en el navegador"; RI-06/RC-01 dicen Rekognition. | ADR-002: procesamiento en memoria en backend + Rekognition, sin persistencia. Corregir el texto del plan. |
| A-12 | **RNF-06** menciona "colorear una figura" como actividad básica, pero RF-44 se retiró de la matriz. | El tipo "Colorea la figura" sigue implementado, así que la prueba de usabilidad de RNF-06 puede incluirlo. |
| A-13 | Prioridad de **RF-22** era *Could* pero su categoría, "Indispensable". | Resuelto en la matriz actualizada: RF-22 es *Must*. |
| A-14 | RI-01 dice "WCAG 21". | WCAG **2.1** nivel AA. |
| A-15 | **RF-67** no dice si una práctica en sábado/domingo suma racha. | No suma racha (solo cuentan días hábiles), pero sí otorga puntos. |
| A-16 | **RF-11** fija máximo 3 intentos, pero no dice qué pasa después. | El ejercicio admite **3 intentos**, en actividades asignadas y en práctica libre. Al 3.er fallo se cierra y se muestra la guía con la respuesta correcta (RF-45). Puntos al acertar: 10, 7 o 5 según el intento; 3 si se pidió la guía. *(Actualizado el 2026-11-26.)* |
| A-17 | El modelo exige `intento_ejercicio.ejercicio_id` (FK a `ejercicio`), pero el código existente genera ejercicios al vuelo con un generador determinista. | Se agrega el valor `generador` a `origen_ejercicio`; cada ejercicio generado se inserta en `ejercicio` (sin datos del alumno) antes de presentarse. |
| A-18 | ADR-004 dice que el alumno elige su avatar, pero no si la cuadrícula muestra nombres. | Según `05-contratos §1`, la cuadrícula muestra avatar + **nombre corto** (primer nombre, nunca apellidos). El avatar es único dentro del grupo. |
| A-19 | ~~EXP-02.6 pide la versión corta~~ **Retirada (2026-11-26):** el alumno hace el diagnóstico completo cada día. Texto original: EXP-02.6 pide la versión corta "con diagnóstico matemático completo en los últimos 7 días", sin decir qué nivel usar ni cómo calificar 1 sola pregunta. | Por tema: si en los últimos `diagnostico_corto_dias` hubo un resultado con ≥ 3 preguntas, se hace 1 pregunta en el último `nivel_dominio`; acierto → se mantiene, fallo → baja 1 (mín. 1). Una versión corta no habilita otra: se exige un diagnóstico completo en la ventana. |
| A-20 | El banco `pregunta_diagnostico` (T-01-04) no existe aún. | Las preguntas del diagnóstico salen del generador determinista existente (semilla por sesión, tema y orden) para todos los temas del grado (con el contenido provisional de geometría y fracciones, A-30). *(Actualizado en EXP-04 entrega 2: antes excluía geometría y fracciones.)* |
| A-21 | `05-contratos §3.1` devuelve `{ afectoPositivo, afectoNegativo }` al alumno al finalizar PANAS-C, pero EXP-02 y RF-65 prohíben que el alumno vea sus puntajes. | Gana la privacidad: `POST …/panas/finalizar` responde solo `{ completado: true }`. |
| A-22 | EXP-02.1 pide una escala "pictográfica de 5 caras", pero una cara feliz en "Muchísimo" contradice los ítems negativos ("¿Qué tan triste…?"). | Se usan círculos de tamaño creciente (intensidad, sin valencia) con etiqueta y audio. A validar con psicopedagogía en T-01-03. |
| A-23 | El nombre del producto es "Numotion" en los specs y "FEEL-FACE" en el código previo. | Se usa "Numotion" (jerarquía de verdad: specs > código), centralizado en `src/modules/shared/marca.ts`. |
| A-24 | **Vigente de nuevo (2026-11-27, A-44), sin ARCO ni preferencia de cámara.** 03-seguridad §6 da 7 días al enlace del tutor, pero la revocación y los derechos ARCO deben poder ejercerse "desde el mismo enlace" en cualquier momento. | Los 7 días solo limitan la **primera aceptación**. Con el enlace vencido se puede revocar, pedir ARCO y cambiar la preferencia de cámara; siempre con OTP. Revocar es definitivo para ese consentimiento: para volver a autorizar, el docente genera un enlace nuevo. |
| A-25 | Los specs listan 7 tipos de interacción y 7 temas, pero no qué tipos admite cada tema. | Catálogo en `shared/dominio/catalogo.ts` (números: identificar, a palabras, selección; operaciones: selección, arrastrar, completar; suma además figuras; geometría: colorear, selección; fracciones: selección, arrastrar). La API rechaza combinaciones fuera del catálogo (422). EXP-04 debe servir cada combinación. |
| A-26 | La tabla de `decidirNivel` (02-…§3.4) no dice cuántos ejercicios cerrados exige R3–R5 ("count(correcto) en ultimos3"). | R3, R4 y R5 solo se evalúan con 3 ejercicios cerrados en la asignación; antes, el nivel no cambia salvo por R1 o R2. |
| A-27 | §4 fija puntos pero no cuántas estrellas da la recompensa (wireframe A6). | Resultado final ≥ 9 → 3 estrellas; ≥ 7 → 2; si no, 1. |
| A-28 | No se dice si el alumno ve actividades con fecha futura. | "Mis actividades" y el motor solo muestran asignaciones con fecha de hoy o anterior. |
| A-29 | ¿Se pueden volver a elegir las opciones ya fallidas? | No: quedan tachadas y deshabilitadas para no repetir el error. Con 3 intentos (A-16), en un ejercicio de 4 opciones el 3.er fallo agota las incorrectas y cierra el ejercicio con la explicación final (RF-45). *(Actualizado el 2026-11-26.)* |
| A-30 | No hay banco validado de geometría y fracciones (T-01-04), pero el catálogo (A-25) los ofrece y el diagnóstico los incluye. | Contenido provisional generado de forma determinista: geometría = colorear la figura (RF-44) y lados/vértices/perímetro; fracciones = identificar, equivalentes, sumar y restar con igual denominador, fracción de una cantidad. Con esto todas las combinaciones del catálogo están disponibles. Se reemplaza por el banco validado cuando exista. |
| A-31 | ¿Qué respuestas se validan de forma optimista en el cliente (EXP-04.8)? | Solo las cerradas (opciones, cifras). El número con letras (tolerancia ortográfica A-07) y el coloreo los evalúa únicamente el servidor: `hashRespuesta` es `null` y el alumno espera la confirmación. |
| A-32 | Sin conexión, ¿se encolan también los intentos que el servidor rechazaría? | La cola (EXP-04.9) solo reintenta fallas de red y 502–504; un rechazo del servidor (4xx) o un error 500 se muestra y se descarta de la cola. Si IndexedDB no está disponible se encola en memoria (se pierde solo si se cierra la página). |
| A-33 | **RF-39** pide una serie de números con un campo junto a cada uno, sin fijar cuántos. | Cada ejercicio muestra **3 números distintos** del rango del nivel, cada uno con su campo. La respuesta viaja como arreglo JSON en el mismo orden; cada número se califica con la tolerancia de A-07 y el ejercicio es correcto solo si los 3 lo son. Tras un fallo el alumno conserva lo escrito para corregirlo. Los ejercicios antiguos de un solo número se siguen calificando. |
| A-34 | **RF-27** pide guías para frustración, ansiedad u otra situación. | Decisión del equipo (2026-11-26): primero se dejó solo la guía de desinterés; después, al retirar las alertas (A-38), se quitaron **todas** las guías de actuación para el docente. Queda solo la parte del alumno: con el Índice de Frustración alto en 2 evaluaciones seguidas se le pregunta "¿Quieres que te ayude?" (o "¿Te ayudo a seguir?" si hay desinterés), como máximo una vez cada 5 min por actividad; si acepta, se abre la guía paso a paso del ejercicio. |
| A-35 | **RF-03** condiciona la práctica a un "dominio insuficiente en la operación". | Decisión del equipo (2026-11-26): todos los juegos siguen disponibles y el nivel no se adapta dentro de la práctica. Los temas con **dominio ≤ 2** en el diagnóstico más reciente se muestran primero (del más bajo al más alto) con la etiqueta "Recomendado". Cada respuesta correcta da puntos según el intento: 3, 2 o 1 (escala menor que la de las actividades, 10/7/5, porque la práctica es ilimitada). Se acreditan al momento; completar el juego no da puntos extra, pero sí suma racha. |
| A-36 | **RF-22** no define qué parte del historial académico personaliza la frase. | Se usan las actividades completadas, el resultado y el tema de la última actividad, y los temas con dominio ≥ 4 y ≤ 2 del diagnóstico más reciente (marcadores `{actividades}`, `{resultado}`, `{tema}`, `{tema_fuerte}` y `{tema_reto}`). Los mensajes académicos pesan igual que los del estado del día y se alternan con ellos. |
| A-37 | **RF-72** fija "en curso" al completarse el primer ejercicio. | Un intento fallido no cambia el estado (sigue "pendiente", aunque `iniciada_en` ya se registra); pasa a "en curso" cuando el primer ejercicio se acierta o agota sus 3 intentos. |
| A-38 | **RF-16** pide la alerta en menos de 2 s. | Decisión del equipo (2026-11-26): las alertas al docente quedan **fuera del MVP** y se retiraron por completo (creación, lista, SSE en vivo, «Marcar como atendida» con nota y guías). Se borraron las tablas `alerta` y `guia_actuacion`. |
| A-39 | **RF-18** pide los temas con mayor índice de error **o** de frustración. | Decisión del equipo (2026-11-26): el reporte muestra solo el **índice de error** (intentos incorrectos / intentos), ordenado de mayor a menor. Se retiraron los aspectos emocionales de la cámara. |
| A-40 | **RF-52** se redefinió: cruzar el diagnóstico de matemáticas con el PANAS-C, por tema. | Por tema y solo con sesiones que tengan ambos resultados: nivel de dominio y % de aciertos del diagnóstico frente al AP/AN del PANAS-C de esa misma sesión, con promedios y las últimas 5 sesiones. Se marca "coincidencia" cuando, en la última sesión, el dominio es ≤ 2 y el AN es ≥ 3. |
| A-41 | RC-07, RC-08 y RNF-10 quedan fuera del MVP. | **RC-08 y RNF-10 volvieron al MVP el 2026-11-27 (A-44); lo demás sigue vigente.** Decisión del equipo (2026-11-26): el alumno entra sin consentimiento del tutor; el docente lo da de alta solo con nombre y apellidos. Se retiraron el flujo del tutor (enlace, código por correo, revocación, ARCO), el administrador, el correo SMTP, la auditoría de accesos y la purga de eventos emocionales, y se borraron sus tablas. La **cámara queda activa para todos los alumnos** durante la actividad (RC-03, RI-02); la imagen sigue sin guardarse (RNF-03, RC-05). Se conserva la página «Aviso de privacidad» (texto en revisión). **Antes de usar la app con alumnos reales debe volver a evaluarse este alcance**: procesa rostros de menores sin consentimiento parental. |
| A-42 | Al retirar las alertas, la regla R2 del motor (bajar un nivel cuando el alumno acepta la ayuda) se quedó sin dato. | Se retiró R2. Aceptar la ayuda solo abre la guía; el acierto posterior vale 3 puntos (A-16). |
| A-43 | ¿Qué muestra la ficha como "estado emocional reciente" (RF-29)? | El PANAS-C del último diagnóstico y las lecturas de la cámara de la última sesión. Se retiró el endpoint del histórico por fechas (`/docente/alumnos/:id/emociones`), que ninguna pantalla usaba. |
| A-44 | RC-08 y RNF-10 vuelven al MVP. | Decisión del equipo (2026-11-27), migración `0016_consentimiento_tutor.sql`: vuelve el flujo del tutor como estaba antes de la 0015 (alta del alumno con nombre y correo del tutor, enlace de 7 días, código de 6 dígitos por correo, aviso de privacidad versionado, estado del consentimiento y «Nuevo enlace» en Mis grupos, bloqueo del alumno sin consentimiento vigente y cierre de sus sesiones al revocar). Diferencias: **sin ARCO, administrador ni auditoría** (RC-07 sigue fuera) y **sin preferencia de cámara**: al aceptar la plataforma el tutor acepta también la detección emocional, y la cámara se usa con todos los alumnos (A-41). Revocar ya no programa el borrado de datos (era una solicitud ARCO); el aviso indica que esas peticiones se hacen con la escuela. La 0015 se corrigió para **no borrar** `consentimiento_tutor` ni `aviso_privacidad`, así producción conserva los consentimientos existentes. Falta la revisión legal del flujo y del aviso antes de usarlo en una institución (métrica de RNF-10). |

## 4. Priorización para el MVP
1. **Must** de core + docente + alumno (flujo principal completo).
2. **Should**: RNF-02, RI-07.
3. **Could**: ninguno en la matriz actualizada (RF-22, RF-40 y RF-41 pasaron a *Must*; RF-44 se retiró).

## 5. Criterios de entrada/salida de la fase
- **Entrada:** matriz de clasificación aprobada.
- **Salida:** CU, HU y matriz de trazabilidad completas; ambigüedades con interpretación adoptada; validación con el docente agendada (T-01-04).
