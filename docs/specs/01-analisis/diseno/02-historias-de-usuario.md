# Historias de usuario

Formato: *Como … quiero … para …* + criterios de aceptación en Gherkin. Estimación en puntos (Fibonacci).

---

## Épica E1 · Acceso, roles y consentimiento

### HU-01 · Iniciar sesión como docente (3 pts) — RNF-04, RC-07
Como **docente** quiero iniciar sesión con correo y contraseña para acceder solo a la información de mis grupos.
```gherkin
Escenario: credenciales válidas
  Dado un docente registrado
  Cuando inicia sesión con correo y contraseña correctos
  Entonces accede a /docente y se registra un evento "login" en auditoría
Escenario: acceso a alumno de otro grupo
  Dado un docente autenticado
  Cuando solicita GET /docente/alumnos/{id} de un alumno que no es de sus grupos
  Entonces recibe 404 y se registra "acceso_denegado" en auditoría
```

### HU-02 · Entrar como alumno sin correo (5 pts) — ADR-004, RNF-06
Como **alumno** quiero entrar con el código de mi grupo, mi avatar y mi clave de dibujos para no tener que escribir una contraseña.
```gherkin
Escenario: entrada correcta
  Dado un alumno con consentimiento vigente
  Cuando escribe el código de grupo, elige su avatar y toca su PIN de 4 íconos
  Entonces entra y se crea o reanuda su sesión del día
Escenario: bloqueo
  Cuando falla el PIN 5 veces
  Entonces se bloquea la entrada de ese alumno por 5 minutos
```

### HU-03 · Consentimiento del tutor (8 pts) — RNF-10, RC-08
Como **tutor** quiero leer el aviso de privacidad y autorizar (o no) el uso de la cámara para decidir sobre los datos de mi hijo/a.
```gherkin
Escenario: sin consentimiento
  Dado un alumno sin consentimiento vigente
  Cuando intenta entrar
  Entonces ve "Pide a tu maestra/o que active tu cuenta" y no se crea sesión
Escenario: consentimiento sin cámara
  Dado un tutor que acepta la plataforma pero no la cámara
  Cuando el alumno abre una actividad
  Entonces no se solicita la cámara y la adaptación usa solo desempeño y PANAS-C
Escenario: revocación
  Cuando el tutor revoca el consentimiento
  Entonces la sesión activa del alumno se cierra en el siguiente request
```

## Épica E2 · Diagnósticos y retroalimentación

### HU-04 · Responder PANAS-C (5 pts) — RF-54
Como **alumno** quiero contestar cómo me siento con caritas y audio para que mi maestra/o sepa cómo llego.
```gherkin
Escenario: completar PANAS-C
  Dado un alumno al inicio de su sesión
  Cuando responde todos los ítems en escala 1-5
  Entonces se guardan las respuestas y los puntajes AP y AN
  Y avanza al diagnóstico matemático
```

### HU-05 · Responder diagnóstico matemático (5 pts) — RF-55
```gherkin
Escenario: completar diagnóstico
  Dado que completó PANAS-C
  Cuando responde las preguntas de cada tema de su grado
  Entonces se guarda un nivel de dominio 1-5 por tema
```

### HU-06 · Generar retroalimentación y desbloquear panel (3 pts) — RF-61, RF-63
```gherkin
Escenario: desbloqueo
  Dado que completó PANAS-C y diagnóstico en la sesión del día
  Entonces se crea un registro de retroalimentación
  Y el alumno ve su panel principal
Escenario: guarda de ruta
  Dado que no ha completado PANAS-C hoy
  Cuando navega a /alumno
  Entonces es redirigido a /alumno/diagnostico/emocional
```

### HU-07 · Ver resumen previo del grupo (5 pts) — RF-14, RF-62
Como **docente** quiero ver antes de mi clase cómo llega emocional y académicamente cada alumno y el grupo.
```gherkin
Escenario: resumen al abrir panel
  Dado un grupo con 20 alumnos, 15 con diagnóstico hoy
  Cuando abro /docente
  Entonces veo la distribución del estado inicial de los 15
  Y 5 alumnos marcados "sin datos hoy" con su último registro previo
```

## Épica E3 · Asignación y seguimiento

### HU-08 · Asignar actividad (8 pts) — RF-56, RF-57
Como **docente** quiero asignar una actividad a todo el grupo o a alumnos específicos para que cada uno inicie en el nivel adecuado.
```gherkin
Escenario: asignar a grupo
  Cuando asigno "Sumas 1" (tema suma, tipo seleccion_multiple) al grupo 3A
  Entonces se crea una asignación por cada alumno activo del grupo
  Y cada asignación tiene nivel_inicial calculado con su diagnóstico
Escenario: destinos excluyentes
  Cuando envío grupoId y alumnoIds a la vez
  Entonces recibo 422 ASIGNACION_DESTINO_INVALIDO
```

### HU-09 · Ver actividades asignadas y su avance (5 pts) — RF-58
### HU-10 · Consultar historial de actividades (5 pts) — RF-59
```gherkin
Escenario: filtrar historial
  Cuando filtro por tema "resta" y periodo septiembre
  Entonces solo veo asignaciones completadas de resta con fecha en septiembre, de más reciente a más antigua
```

## Épica E4 · Actividades del alumno

### HU-11 · Ver mis actividades (3 pts) — RF-64
### HU-12 · Resolver ejercicios y registrar avance (8 pts) — RF-60, RF-47
```gherkin
Escenario: registrar intento
  Cuando respondo un ejercicio
  Entonces se guarda respuesta, correcta, tiempo_ms y número de intento
  Y la asignación pasa a "en_curso" si estaba "pendiente"
Escenario: completar
  Cuando resuelvo el último ejercicio
  Entonces la asignación pasa a "completada" con resultado final
```

### HU-13 · Tipos de ejercicio interactivos (13 pts) — RF-10, RF-39, RF-40, RF-41, RF-42, RF-44
```gherkin
Escenario: escritura en palabras con tolerancia
  Dado el número 15
  Cuando escribo "quinse"
  Entonces la respuesta se acepta como correcta (distancia 1)
Escenario: identificar número
  Entonces los números mostrados no son consecutivos
```

### HU-14 · Dificultad adaptativa (8 pts) — RF-01, RF-21
```gherkin
Escenario: bajar por frustración
  Dado nivel 3, 2 errores consecutivos y emoción derivada "frustracion"
  Entonces el siguiente ejercicio es nivel 2 y se registra motivo "combinado"
Escenario: límites
  Dado nivel 1 y frustración
  Entonces el nivel se mantiene en 1
```

### HU-15 · Ayuda paso a paso (5 pts) — RF-11, RF-45
```gherkin
Escenario: ayuda automática
  Cuando fallo el 3er intento
  Entonces se muestra la guía paso a paso
Escenario: explicación final
  Cuando cierro un ejercicio sin acertar
  Entonces veo el procedimiento completo y la respuesta correcta
```

## Épica E5 · Emoción y alertas

### HU-16 · Detección emocional sin guardar mi cara (8 pts) — RI-02, RI-06, RNF-03
```gherkin
Escenario: no persistencia
  Cuando se procesa un frame
  Entonces solo se guarda emoción, confianza y estado derivado
  Y no existe ningún objeto ni columna con los bytes de la imagen
```

### HU-17 · Alerta temprana al docente (8 pts) — RF-16
```gherkin
Escenario: alerta
  Dado un alumno con IF ≥ 0.6 en 2 evaluaciones consecutivas
  Entonces el docente recibe una alerta por SSE en menos de 5 s
  Y no se repite otra alerta del mismo alumno y asignación en 5 minutos
```

### HU-18 · Guía de actuación (5 pts) — RF-27

## Épica E6 · Gamificación

### HU-19 · Puntos, niveles e insignias (5 pts) — RF-03
### HU-20 · Ver mi racha (3 pts) — RF-66
### HU-21 · Calcular y conservar racha (5 pts) — RF-67, RF-68
```gherkin
Escenario: fin de semana no rompe
  Dado racha 4 con última práctica el viernes
  Cuando completo una práctica el lunes
  Entonces mi racha es 5
Escenario: día hábil perdido
  Dado racha 4 con última práctica el lunes
  Cuando no practico el martes y consulto el miércoles
  Entonces mi racha actual es 0 y mi mejor racha sigue en 4
Escenario: una vez por día
  Cuando completo 3 prácticas el mismo día
  Entonces la racha sube solo 1
```
### HU-22 · Mi perfil (2 pts) — RF-65
### HU-23 · Mensaje motivacional (2 pts) — RF-22

## Épica E7 · Información y reportes del docente

### HU-24 · Ficha del alumno (5 pts) — RF-29
### HU-25 · Perfil estadístico (8 pts) — RF-19
### HU-26 · Notas rápidas (2 pts) — RF-50
```gherkin
Escenario: nota rápida
  Cuando escribo "Se distrajo con el ruido" con etiqueta "conducta"
  Entonces se guarda con la fecha actual automática
```
### HU-27 · Consolidar resultados académicos (5 pts) — RF-35
### HU-28 · Cruce académico-emocional por tema (8 pts) — RF-52
### HU-29 · Reporte de temas con mayor error/frustración (5 pts) — RF-18

**Total estimado:** ~170 pts.
