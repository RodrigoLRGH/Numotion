# 01 · Análisis — Requerimientos normalizados

Fuente: Matriz de Clasificación (`docs/requerimientos.docx`). Los IDs **no se renumeran**. Aquí se agrupan por módulo, se fijan criterios verificables y se resuelven ambigüedades.

## 1. Requerimientos funcionales por módulo

### 1.1 Módulo Alumno
| ID | Nombre | Criterio verificable (resumen) | MoSCoW |
|---|---|---|---|
| RF-54 | Diagnóstico emocional PANAS-C | Cuestionario por sesión; registra afecto positivo (AP) y negativo (AN) | Must |
| RF-55 | Diagnóstico matemático | Preguntas por tema; registra nivel de dominio 1–5 por tema | Must |
| RF-63 | Panel principal | Accesible **solo** con RF-54 y RF-55 completos en la sesión del día; enlaza a actividades, perfil, racha/insignias, práctica libre | Must |
| RF-64 | Actividades asignadas | Lista con nombre, tema, tipo, fecha, estado; abre pendientes y retoma en curso | Must |
| RF-60 | Responder ejercicios | Registra respuesta, si fue correcta y avance (en curso/finalizada) | Must |
| RF-10 | Actividades interactivas | Cada actividad usa ≥ 1 tipo de interacción (arrastrar o selección múltiple, ampliado por A-05) | Must |
| RF-39 | Escribir número en palabras | Campo de texto; tolerancia ortográfica menor (A-07) | Must |
| RF-40 | Identificar número | Números aleatorios no consecutivos; seleccionar el solicitado | Could |
| RF-41 | Sumar con figuras | Conjuntos de figuras + campo de resultado | Could |
| RF-42 | Completar operación | Operación con faltante + opciones múltiples; +, −, ×, ÷ | Must |
| RF-44 | Colorear figuras | Paleta; colorear la figura solicitada | Could |
| RF-11 | Solución guiada | A petición o tras 3 intentos fallidos | Must |
| RF-45 | Guía por fallo | Explicación y solución correcta al fallar definitivamente (A-03) | Must |
| RF-47 | Tiempo de resolución | `tiempo_ms` por intento y por ejercicio | Must |
| RF-03 | Gamificación | Niveles progresivos, puntos por acierto, recompensas visuales | Must |
| RF-65 | Perfil | Nombre, grado, grupo, nivel de gamificación, insignias; **sin datos emocionales** | Must |
| RF-66 | Racha e insignias | Racha actual (días) visual + insignias; sin rankings | Must |
| RF-67 | Calcular racha | Días hábiles consecutivos con ≥ 1 práctica libre completada; fines de semana no rompen | Must |
| RF-68 | Conservar mejor racha | `mejor_racha` nunca disminuye | Must |
| RF-22 | Mensaje motivacional | Frase personalizada al iniciar | Could |

### 1.2 Módulo Docente
| ID | Nombre | Criterio verificable (resumen) | MoSCoW |
|---|---|---|---|
| RF-14 | Resumen previo emocional | Al entrar, resumen individual y grupal de la interacción más reciente | Must |
| RF-62 | Visualizar retroalimentación | PANAS-C + métricas del diagnóstico por alumno y grupo | Must |
| RF-56 | Asignar actividad | Nombre, tema, tipo, fecha, destinatarios: grupo **o** alumnos (excluyente) | Must |
| RF-57 | Registrar asignación | Crea una asignación por alumno con nivel inicial basado en diagnóstico | Must |
| RF-58 | Actividades asignadas | Lista con estado por alumno, fecha y nivel inicial | Must |
| RF-59 | Historial | Actividades finalizadas, cronológico, filtros por alumno/tema/periodo | Must |
| RF-16 | Alerta temprana de frustración | Alerta en tiempo real antes del abandono | Must |
| RF-27 | Guía de actuación | Pasos sugeridos según la situación emocional (A-04) | Must |
| RF-29 | Consultar estudiante | Desempeño, estado emocional reciente, notas | Must |
| RF-19 | Perfil estadístico | Tiempo, intentos, tipos de error, habilidades de menor dominio | Must |
| RF-18 | Reporte de error/frustración | Temas/subtemas con mayor índice a nivel grupal | Must |
| RF-35 | Consolidar resultados | Tareas, trabajos en clase, interrogaciones por alumno | Must |
| RF-50 | Notas rápidas | Fecha automática, texto libre, etiqueta opcional | Must |
| RF-52 | Cruce académico-emocional | Por tema: resultados consolidados vs datos emocionales | Must |

### 1.3 Núcleo (core)
| ID | Nombre | Criterio verificable |
|---|---|---|
| RF-01 | Adaptar por emoción | Nivel ∈ [1,5]; la emoción modifica el nivel |
| RF-21 | Adaptar automáticamente | Desempeño + emoción, dentro del mismo tema |
| RF-61 | Crear retroalimentación | Triangulación PANAS-C + diagnóstico → registro de retroalimentación (A-01) |

## 2. No funcionales, interfaz y restricciones

| ID | Criterio verificable | Verificación |
|---|---|---|
| RNF-01 | p95 ≤ 2 s en interacciones del alumno | k6 + Playwright (P-PERF-01) |
| RNF-02 | p95 ≤ 30 s en guía, resumen grupal, generación | k6 (P-PERF-02) |
| RNF-03 | Imagen facial solo en memoria durante la sesión | Auditoría + prueba P-SEC-03 |
| RNF-04 | Docente autenticado; solo ve su grupo | P-SEC-01, P-DB-04 |
| RNF-06 | 90 % de éxito, 10 alumnos, sin instrucción | Prueba de usabilidad (P-UX-01) |
| RNF-10 | Consentimiento verificable previo | P-SEC-04, P-E2E-01 + revisión legal |
| RI-01 | Web, identidad visual, WCAG 2.1 AA | axe-core en Playwright (P-A11Y-01) |
| RI-02 / RC-03 | Cámara por alumno, activa durante actividad | P-E2E-04 (permiso/negación) |
| RI-03 | Táctil, mouse o teclado | Pruebas de interacción por puntero y teclado |
| RI-05 | Internet estable | Manejo offline: cola local de intentos (EXP-04.9, P-E2E-05) |
| RI-06 | Rekognition sin almacenar imagen | P-INT-01 (mock) + P-SEC-03 |
| RI-07 | OpenAI con respaldo | P-INT-02 |
| RI-09 | HTTPS en todo | HSTS + redirección; P-SEC-05 |
| RC-01 | Sin modelos propios | Revisión de arquitectura |
| RC-02 | AWS | IaC / despliegue |
| RC-04 | Presupuesto limitado | Métricas de llamadas; topes configurables |
| RC-05 | Sin biométricos almacenados | = RNF-03 |
| RC-07 | LFPDPPP: cifrado, roles, auditoría, aviso, ARCO | P-SEC-*, tabla `auditoria_acceso`, endpoint ARCO |
| RC-08 | LGDNNA: consentimiento parental | = RNF-10 |

## 3. Ambigüedades e inconsistencias detectadas

| ID | Hallazgo | Interpretación adoptada (vigente hasta validar) |
|---|---|---|
| A-01 | **RF-61** "Crear la retroalimentación" tiene la misma descripción que RF-63 (copiada). | RF-61 = el sistema **genera y guarda** un registro de retroalimentación por alumno y sesión al completar PANAS-C + diagnóstico (triangulación). RF-63 = panel del alumno. |
| A-02 | **RF-01** y **RF-21** se solapan. | Un solo motor adaptativo. RF-01 cubre el factor emocional; RF-21 la combinación desempeño + emoción dentro del tema. |
| A-03 | **RF-11** y **RF-45** se solapan (la propia matriz lo advierte). | RF-11: **ayuda durante** el ejercicio (botón "Ayuda" o automática al 3.er fallo) con pasos progresivos, sin revelar la respuesta hasta el último paso. RF-45: **explicación final** al cerrar el ejercicio fallado (procedimiento completo + respuesta correcta). |
| A-04 | **RF-27** dice que la guía es para el docente pero "pregunta al alumno si desea recibirla". | Dos piezas: (a) al docente: guía de actuación paso a paso ligada a la alerta; (b) al alumno: mensaje "¿Quieres que te ayude?" que, si acepta, abre RF-11 y una pausa activa breve. |
| A-05 | **RF-10** limita a "arrastrar o selección múltiple", pero RF-39 (texto), RF-44 (colorear) y RF-41 (campo) usan otras. RF-56 repite la limitación. | Enum `tipo_interaccion` con 7 valores (ver modelo de datos). El docente elige el tipo al asignar; RF-10 se cumple porque cada actividad tiene ≥ 1 tipo. |
| A-06 | **RF-66** cita "RF-09" (gestión pedagógica de la competencia), inexistente en la matriz. | Se ignora la referencia; se aplica el principio "sin rankings ni comparaciones". Validar si RF-09 fue eliminado. |
| A-07 | **RF-39** "tolerancia de errores ortográficos menores" no está cuantificada. | Normalizar (minúsculas, sin acentos, espacios simples) y aceptar distancia de Levenshtein ≤ 1 por cada 8 caracteres de la respuesta esperada (mín. 1). |
| A-08 | **RF-16** no define "señales de frustración". | Índice de frustración (IF) ∈ [0,1] combinando emoción, errores consecutivos, inactividad y ayudas (ver 02-diseno §3.3). Alerta si IF ≥ 0.6 sostenido en 2 evaluaciones. |
| A-09 | **RF-14** "antes de iniciar la sesión de clases" y "interacción más reciente". | Al abrir el panel docente se muestra el último registro de retroalimentación de cada alumno (y del grupo agregado); se marca "sin datos hoy" si el alumno aún no ha hecho diagnóstico en el día. |
| A-10 | **RF-35** habla de tareas, trabajos e interrogaciones que **no se generan en el sistema**. | El docente los captura manualmente (calificación 0–10 por tema); las actividades de Numotion se consolidan automáticamente junto a ellos. |
| A-11 | **Plan de negocios** dice que el procesamiento facial ocurre "en el navegador"; RI-06/RC-01 dicen Rekognition. | ADR-002: procesamiento en memoria en backend + Rekognition, sin persistencia. Corregir el texto del plan. |
| A-12 | **RNF-06** menciona "colorear una figura" como actividad básica, pero RF-44 es *Could have*. | RF-44 se mantiene *Could*; la prueba de usabilidad usa RF-39 y RF-40/42 si RF-44 no está listo. |
| A-13 | Prioridad de **RF-22** es *Could* pero categoría "Indispensable". | Se respeta MoSCoW (*Could*). |
| A-14 | RI-01 dice "WCAG 21". | WCAG **2.1** nivel AA. |
| A-15 | **RF-67** no dice si una práctica en sábado/domingo suma racha. | No suma racha (solo cuentan días hábiles), pero sí otorga puntos. |
| A-16 | **RF-11** fija máximo 3 intentos antes de la guía, pero no dice qué pasa después. | Tras el 3.er fallo se muestra la guía y se permite un 4.º intento; si falla, el ejercicio se cierra con la explicación final (RF-45). |
| A-17 | El modelo exige `intento_ejercicio.ejercicio_id` (FK a `ejercicio`), pero el código existente genera ejercicios al vuelo con un generador determinista. | Se agrega el valor `generador` a `origen_ejercicio`; cada ejercicio generado se inserta en `ejercicio` (sin datos del alumno) antes de presentarse. |
| A-18 | ADR-004 dice que el alumno elige su avatar, pero no si la cuadrícula muestra nombres. | Según `05-contratos §1`, la cuadrícula muestra avatar + **nombre corto** (primer nombre, nunca apellidos). El avatar es único dentro del grupo. |
| A-19 | EXP-02.6 pide la versión corta "con diagnóstico matemático completo en los últimos 7 días", sin decir qué nivel usar ni cómo calificar 1 sola pregunta. | Por tema: si en los últimos `diagnostico_corto_dias` hubo un resultado con ≥ 3 preguntas, se hace 1 pregunta en el último `nivel_dominio`; acierto → se mantiene, fallo → baja 1 (mín. 1). Una versión corta no habilita otra: se exige un diagnóstico completo en la ventana. |
| A-20 | El banco `pregunta_diagnostico` (T-01-04) no existe aún. | Las preguntas del diagnóstico salen del generador determinista existente (semilla por sesión, tema y orden) para todos los temas del grado (con el contenido provisional de geometría y fracciones, A-30). *(Actualizado en EXP-04 entrega 2: antes excluía geometría y fracciones.)* |
| A-21 | `05-contratos §3.1` devuelve `{ afectoPositivo, afectoNegativo }` al alumno al finalizar PANAS-C, pero EXP-02 y RF-65 prohíben que el alumno vea sus puntajes. | Gana la privacidad: `POST …/panas/finalizar` responde solo `{ completado: true }`. |
| A-22 | EXP-02.1 pide una escala "pictográfica de 5 caras", pero una cara feliz en "Muchísimo" contradice los ítems negativos ("¿Qué tan triste…?"). | Se usan círculos de tamaño creciente (intensidad, sin valencia) con etiqueta y audio. A validar con psicopedagogía en T-01-03. |
| A-23 | El nombre del producto es "Numotion" en los specs y "FEEL-FACE" en el código previo. | Se usa "Numotion" (jerarquía de verdad: specs > código), centralizado en `src/modules/shared/marca.ts`. |
| A-24 | 03-seguridad §6 da 7 días al enlace del tutor, pero la revocación y los derechos ARCO deben poder ejercerse "desde el mismo enlace" en cualquier momento. | Los 7 días solo limitan la **primera aceptación**. Con el enlace vencido se puede revocar, pedir ARCO y cambiar la preferencia de cámara; siempre con OTP. Revocar es definitivo para ese consentimiento: para volver a autorizar, el docente genera un enlace nuevo. |
| A-25 | Los specs listan 7 tipos de interacción y 7 temas, pero no qué tipos admite cada tema. | Catálogo en `shared/dominio/catalogo.ts` (números: identificar, a palabras, selección; operaciones: selección, arrastrar, completar; suma además figuras; geometría: colorear, selección; fracciones: selección, arrastrar). La API rechaza combinaciones fuera del catálogo (422). EXP-04 debe servir cada combinación. |
| A-26 | La tabla de `decidirNivel` (02-…§3.4) no dice cuántos ejercicios cerrados exige R3–R5 ("count(correcto) en ultimos3"). | R3, R4 y R5 solo se evalúan con 3 ejercicios cerrados en la asignación; antes, el nivel no cambia salvo por R1 o R2. |
| A-27 | §4 fija puntos pero no cuántas estrellas da la recompensa (wireframe A6). | Resultado final ≥ 9 → 3 estrellas; ≥ 7 → 2; si no, 1. |
| A-28 | No se dice si el alumno ve actividades con fecha futura. | "Mis actividades" y el motor solo muestran asignaciones con fecha de hoy o anterior. |
| A-29 | Con 4 opciones y 4 intentos, ¿se pueden volver a elegir las opciones ya fallidas? | No: quedan tachadas y deshabilitadas para no repetir el error. Consecuencia: en ejercicios de 4 opciones el 4.º intento solo deja la correcta (tras ver la guía, vale 3 puntos) y la explicación final (RF-45) solo se ve en tipos de respuesta abierta. **A validar con el docente.** |
| A-30 | No hay banco validado de geometría y fracciones (T-01-04), pero el catálogo (A-25) los ofrece y el diagnóstico los incluye. | Contenido provisional generado de forma determinista: geometría = colorear la figura (RF-44) y lados/vértices/perímetro; fracciones = identificar, equivalentes, sumar y restar con igual denominador, fracción de una cantidad. Con esto todas las combinaciones del catálogo están disponibles. Se reemplaza por el banco validado cuando exista. |
| A-31 | ¿Qué respuestas se validan de forma optimista en el cliente (EXP-04.8)? | Solo las cerradas (opciones, cifras). El número con letras (tolerancia ortográfica A-07) y el coloreo los evalúa únicamente el servidor: `hashRespuesta` es `null` y el alumno espera la confirmación. |
| A-32 | Sin conexión, ¿se encolan también los intentos que el servidor rechazaría? | La cola (EXP-04.9) solo reintenta fallas de red y 502–504; un rechazo del servidor (4xx) o un error 500 se muestra y se descarta de la cola. Si IndexedDB no está disponible se encola en memoria (se pierde solo si se cierra la página). |

## 4. Priorización para el MVP
1. **Must** de core + docente + alumno (flujo principal completo).
2. **Should**: RNF-02, RI-07.
3. **Could**: RF-22, RF-40, RF-41, RF-44.

## 5. Criterios de entrada/salida de la fase
- **Entrada:** matriz de clasificación aprobada.
- **Salida:** CU, HU y matriz de trazabilidad completas; ambigüedades con interpretación adoptada; validación con el docente agendada (T-01-04).
