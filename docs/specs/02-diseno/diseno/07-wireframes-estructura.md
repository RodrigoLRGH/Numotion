# Wireframes (estructura)

Baja fidelidad para fijar contenido y jerarquía. El diseño visual final sigue la identidad de RI-01.

## Alumno

### A1 · Entrar (ADR-004)
```
┌──────────────────────────────────────┐
│        🦊 Numotion            🔊      │
│   Escribe el código de tu grupo      │
│   ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐           │
│   │ K││ 7││ P││ 2││ M││ 9│           │
│   └──┘└──┘└──┘└──┘└──┘└──┘           │
│            [  Seguir ➜  ]            │
├──────────────────────────────────────┤
│   ¿Quién eres?                  🔊   │
│   [🦊 Ana] [🐢 Beto] [🐼 Caro] ...    │
├──────────────────────────────────────┤
│   Toca tu clave secreta         🔊   │
│   ● ● ○ ○                            │
│   [☀️][🌙][⭐][🐟][🌳][🚗]             │
│   [🍎][⚽][🎈][🐱][🌸][🚀]   [⌫]       │
└──────────────────────────────────────┘
```

### A2 · PANAS-C (RF-54) — un ítem por pantalla
```
┌──────────────────────────────────────┐
│  ▓▓▓▓▓░░░░░  4 de 10            🔊   │
│                                      │
│     Hoy me siento… ALEGRE            │
│                                      │
│   😞     🙁     😐     🙂     😄       │
│  Nada  Poco  Algo  Bastante Mucho    │
│                                      │
│   [← Atrás]                          │
└──────────────────────────────────────┘
```

### A3 · Panel principal (RF-63, RF-22, RF-66, RF-64)
```
┌──────────────────────────────────────┐
│ 🦊 Ana · Nivel 3 ▓▓▓▓░░ 340 pts  [Salir]│
├──────────────────────────────────────┤
│ 💬 "¡Hola Ana! Llevas 3 días seguidos" 🔊│
├──────────────────────────────────────┤
│ 🔥 Racha: 3 días     Mejor: 7        │
│  L ● M ● M ● J ○ V ○                 │
├──────────────────────────────────────┤
│ 📚 Mis actividades                   │
│ ┌──────────────────────────────────┐ │
│ │ ➕ Sumas 1 · Suma · 4/10 · En curso │ │
│ │                     [Continuar ▶]│ │
│ ├──────────────────────────────────┤ │
│ │ ➖ Restas · Resta · Nueva           │ │
│ │                     [Empezar ▶]  │ │
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│ 🎮 Jugar libre    🏅 Mis insignias   👤 Mi perfil │
└──────────────────────────────────────┘
```

### A4 · Resolver ejercicio — completar operación (RF-42, RF-11)
```
┌──────────────────────────────────────┐
│ Sumas 1   ▓▓▓▓▓░░░░░ 5/10   📷 activa │
├──────────────────────────────────────┤
│   Elige el número que falta     🔊   │
│                                      │
│        7  +  [ ? ]  =  12            │
│                                      │
│   [ 3 ]   [ 5 ]   [ 6 ]   [ 8 ]      │
│                                      │
│   [💡 Ayuda]                         │
└──────────────────────────────────────┘
Fallo 3 → panel inferior "Vamos paso a paso": Paso 1 de 3 [Siguiente ▶]
Fallo 4 → modal "Así se resuelve": pasos completos + respuesta 5 + [Seguir ▶]
Ofrecer ayuda (IF alto) → "¿Quieres que te ayude? [Sí 👍] [No, yo puedo 💪]"
```

### A5 · Otros tipos
```
Número a palabras (RF-39)     Identificar número (RF-40)     Suma con figuras (RF-41)
┌───────────────────────┐     ┌───────────────────────┐      ┌───────────────────────┐
│ Escribe con letras:   │     │ Toca el número 47     │      │ 🍎🍎🍎  +  🍎🍎🍎🍎       │
│        15             │     │ [12] [83] [47]        │      │ ¿Cuántas hay?          │
│ [ quince__________ ]  │     │ [29] [ 3] [65]        │      │ [ __ ]  [✓ Listo]      │
│ [✓ Listo]             │     └───────────────────────┘      └───────────────────────┘
└───────────────────────┘
Colorear (RF-44)
┌──────────────────────────────────────┐
│ Pinta de ROJO el TRIÁNGULO       🔊  │
│    △      ○      □                   │
│ Paleta: 🔴 🔵 🟢 🟡 🟣 🟠 ⚫ ⚪  [✓ Listo]│
└──────────────────────────────────────┘
```

### A6 · Recompensa (RF-03)
```
┌──────────────────────────────────────┐
│          🎉 ¡Terminaste!              │
│     ⭐⭐⭐   +85 puntos                 │
│     🏅 Nueva insignia: Valiente       │
│     🦊 ¡Tu zorro tiene sombrero nuevo! │
│          [ Volver al inicio ]         │
└──────────────────────────────────────┘
```

### A7 · Perfil (RF-65)
Nombre, grado, grupo, personaje grande, nivel + barra de puntos, cuadrícula de insignias (obtenidas a color, pendientes en gris). **Sin** datos emocionales ni comparaciones.

## Docente

### D1 · Panel docente — resumen previo (RF-14, RF-62, RF-16)
```
┌───────────┬──────────────────────────────────────────────────────┐
│ Numotion  │ Grupo: [3A ▼]     Lunes 26 oct            🔔 2        │
│ ▸ Panel   ├──────────────────────────────────────────────────────┤
│ ▸ Activ.  │ Cómo llega tu grupo hoy (15 de 20 con diagnóstico)   │
│ ▸ Histor. │ ██████████ Positivo 7  ██████ Neutral 5              │
│ ▸ Reportes│ ██ Frustración 2      █ Desinterés 1   ░ Sin datos 5 │
│           │ AP prom 3.4 · AN prom 1.9                            │
│           ├──────────────────────────────────────────────────────┤
│           │ ⚠ Alertas activas                                     │
│           │ Luis R. · Restas 2 · frustración 0.68  [Ver guía]    │
│           ├──────────────────────────────────────────────────────┤
│           │ Alumno       Estado    AP   AN   Suma  Resta   ⋯     │
│           │ Ana López    🙂 Pos.   4.0  1.4   4     2     [Ver]  │
│           │ Luis R.      😟 Frus.  2.1  3.4   2     1     [Ver]  │
│           │ Mia T.       ░ sin datos hoy (último: 23 oct) [Ver]  │
└───────────┴──────────────────────────────────────────────────────┘
```

### D2 · Nueva actividad — wizard (RF-56, RF-57)
```
Paso 1 Datos        Paso 2 Destinatarios          Paso 3 Confirmar
Nombre [Sumas 1  ]  (•) Todo el grupo [3A ▼]      Alumno     Nivel inicial
Tema   [Suma    ▼]  ( ) Alumnos específicos       Ana López  3
Tipo   [Selección▼]     [☐ Ana] [☐ Luis] ...      Luis R.    1 (frustración)
Fecha  [27/10/2026]   (excluyente: elegir uno)    Mia T.     2 (sin diagnóstico)
Ejerc. [10]                                       [← Atrás]   [Asignar ✓]
```

### D3 · Actividades asignadas (RF-58) e Historial (RF-59)
```
Actividades asignadas                                  [+ Nueva]
Sumas 1 · Suma · 27/10  ▓▓▓▓▓▓░░░ 12 ✓ 3 ▶ 5 ○        [▼ ver alumnos]
   Ana López   ▶ En curso   inicial 3 → actual 4
   Luis R.     ○ Pendiente  inicial 1

Historial   Alumno [Todos ▼] Tema [Todos ▼] Desde [__] Hasta [__]
Fecha       Alumno     Actividad   Tema   Resultado  Nivel ini→fin
26/10 10:42 Ana López  Sumas 1     Suma   9.0        3 → 5
```

### D4 · Ficha del alumno (RF-29, RF-19, RF-52, RF-35, RF-50)
```
Ana López · 3A                     Estado reciente: 🙂 Positivo (hoy)
[Resumen] [Perfil estadístico] [Cruce emoción-desempeño] [Resultados] [Notas]
Perfil estadístico: Tema | t. prom | intentos prom | % aciertos | errores (cálculo/proced./…)
  Menor dominio: Resta con préstamo (41 %), División exacta (55 %)
Cruce: gráfico de barras por tema (promedio académico) + línea % frustración; ⚠ coincidencia en Resta
Resultados: tabla por tema × (tarea, trabajo en clase, interrogación, Numotion) [+ Capturar calificación]
Notas: [ Texto libre_______________ ] [etiqueta ▼] [Guardar]   (fecha automática)
```

### D5 · Alerta y guía de actuación (RF-16, RF-27)
```
⚠ Luis R. muestra señales de frustración — Restas 2 (hace 1 min)
Señales: emoción frustración · 3 errores seguidos · 40 s sin responder
El alumno aceptó ayuda: Sí
Guía de actuación
 1. Acércate con calma y pregúntale cómo va.
 2. Reconoce el esfuerzo antes de corregir.
 3. Resuelvan juntos un paso del ejercicio.
 4. Propón una pausa activa de 1 minuto si persiste.
[Nota rápida ____________]   [Marcar como atendida ✓]
```

### D6 · Reportes (RF-18)
Tabla/heatmap tema × subtema con índice de error e índice de frustración, orden seleccionable, periodo, [Exportar CSV].
