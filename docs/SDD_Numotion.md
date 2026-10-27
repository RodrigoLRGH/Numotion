# SDD — Numotion (MAES)
**Especificación de Diseño de Software · v1.0 · 2026-10-26**

> Documento raíz. Resume alcance, arquitectura y componentes. El detalle vive en `specs/`.
> Fuente de verdad de requerimientos: `docs/requerimientos.docx` (Matriz de Clasificación) y `Plan_De_Negocios v6.0`.

---

## 1. Propósito

Numotion es una plataforma web de aprendizaje de matemáticas para educación básica (6 a 12 años, alumnado neurotípico) que **adapta la dificultad de los ejercicios según el desempeño y el estado emocional** del alumno, detectado por expresiones faciales (AWS Rekognition) y por diagnósticos de sesión (PANAS-C + diagnóstico matemático). Ofrece al docente un panel con el estado emocional y académico de cada alumno y del grupo, alertas tempranas de frustración y reportes.

El proyecto `teds_project-main` se refactoriza en **dos módulos funcionales independientes**:

| Módulo | Usuario | Responsabilidad principal |
|---|---|---|
| **Módulo Docente** | Docente autenticado | Asignar actividades, ver retroalimentación (PANAS-C + diagnóstico), alertas, perfiles, notas, reportes, historial |
| **Módulo Alumno** | Alumno (menor, con consentimiento de tutor) | Diagnósticos de sesión, panel principal, resolver actividades adaptativas, práctica libre, perfil, racha e insignias |

Ambos comparten un **núcleo** (`shared`/`core`): autenticación, catálogo de temas y ejercicios, motor adaptativo, servicio de emociones, auditoría.

## 2. Alcance

### 2.1 Dentro del alcance (MVP)
- 37 RF (todos los de la matriz), 6 RNF, 7 RI, 7 RC.
- Temas iniciales: números (lectura/escritura/identificación), suma, resta, multiplicación, división, figuras geométricas. Fracciones y áreas quedan como **temas de catálogo extensibles** (mencionados en el plan, sin RF de actividad específica).
- Tipos de interacción: selección múltiple, arrastrar, escritura en palabras (RF-39), identificar número (RF-40), suma con figuras (RF-41), completar operación (RF-42), colorear figura (RF-44).

### 2.2 Fuera del alcance (plan de negocios §1.6)
- Integración con sistemas de gestión escolar de terceros.
- App nativa móvil (la web debe ser responsiva).
- Alumnado neurodivergente como segmento objetivo.
- Portal para padres/tutores (solo flujo de consentimiento y aviso de privacidad).

## 3. Objetivos medibles

| Objetivo | Métrica | Origen |
|---|---|---|
| Interacción fluida del alumno | p95 ≤ 2 s en tocar/arrastrar/validar | RNF-01 |
| Generación de contenido/reportes | p95 ≤ 30 s | RNF-02 |
| Usabilidad infantil sin instrucción | ≥ 90 % de éxito con 10 alumnos | RNF-06 |
| Cero imágenes faciales persistidas | 0 objetos/filas con bytes de imagen en auditoría | RNF-03, RC-05 |
| Aislamiento por grupo | 0 accesos exitosos a alumnos fuera del grupo del docente | RNF-04 |
| Adaptación acotada | Nivel siempre en [1, 5] | RF-01, RF-21 |

## 4. Arquitectura (resumen)

```
┌──────────────────────── Navegador (HTTPS, RI-09) ────────────────────────┐
│  SPA React + TypeScript (Vite)                                          │
│  ├─ modules/docente   ├─ modules/alumno   ├─ shared (ui, api, auth)     │
│  └─ useEmotionCapture: getUserMedia → frame JPEG 320px en memoria       │
└───────────────┬──────────────────────────────────────────────────────────┘
                │ REST /api/v1  +  SSE (alertas docente)
┌───────────────▼──────────────── AWS (RC-02) ────────────────────────────┐
│  API Node.js 20 + TypeScript (Express, arquitectura modular)            │
│  ├─ modules/docente  ├─ modules/alumno  ├─ core (auth, adaptive,        │
│  │                                        emotion, content, audit)      │
│  ├─ EmotionGateway ──► AWS Rekognition DetectFaces (bytes en memoria)   │
│  └─ ContentGateway ──► OpenAI API (ejercicios/historias, RI-07)         │
│  PostgreSQL 16 (RDS, cifrado en reposo) · Secrets Manager · CloudWatch  │
│  Hosting: S3 + CloudFront (SPA) · App Runner/ECS Fargate (API)           │
└─────────────────────────────────────────────────────────────────────────┘
```

Decisiones clave (detalle en `specs/00-contexto/adr.md`):
- **ADR-001** Monolito modular (un backend, módulos docente/alumno/core) en lugar de microservicios.
- **ADR-002** El frame facial viaja al backend y se envía a Rekognition **como bytes en memoria**; nunca a S3 ni a BD.
- **ADR-003** PostgreSQL con RLS como defensa en profundidad del aislamiento por grupo.
- **ADR-004** Alumno entra con código de grupo + selección de avatar + PIN pictográfico (sin correo).
- **ADR-005** Motor adaptativo determinista basado en reglas (explicable), no ML propio (RC-01).
- **ADR-006** Alertas en tiempo real por Server-Sent Events.
- **ADR-007** OpenAI es opcional (Should have) y siempre con catálogo de respaldo.

## 5. Componentes clave

| Componente | Módulo | RF/RNF |
|---|---|---|
| Autenticación y roles | core | RNF-04, RC-07 |
| Consentimiento parental | core | RNF-10, RC-08 |
| Diagnóstico PANAS-C | alumno | RF-54 |
| Diagnóstico matemático | alumno | RF-55 |
| Retroalimentación (triangulación) | core → docente | RF-61, RF-62, RF-14 |
| Asignación de actividades | docente | RF-56, RF-57, RF-58, RF-59 |
| Panel del alumno | alumno | RF-63, RF-64, RF-65, RF-22 |
| Motor de ejercicios | alumno | RF-10, RF-39–RF-44, RF-60, RF-47 |
| Motor adaptativo | core | RF-01, RF-21 |
| Solución guiada | core | RF-11, RF-45 |
| Servicio de emociones | core | RI-02, RI-06, RNF-03, RC-05 |
| Alertas de frustración | docente | RF-16, RF-27 |
| Gamificación | alumno | RF-03, RF-66, RF-67, RF-68 |
| Perfil y reportes | docente | RF-18, RF-19, RF-29, RF-35, RF-50, RF-52 |

## 6. Flujo principal

1. Docente inicia sesión → ve **resumen previo** emocional individual y grupal (RF-14).
2. Docente asigna actividad (tema, tipo, fecha, grupo o alumnos) (RF-56) → el sistema crea una asignación por alumno con **nivel inicial** derivado del diagnóstico (RF-57).
3. Alumno entra → completa **PANAS-C** y **diagnóstico matemático** de la sesión (RF-54, RF-55) → se genera la **retroalimentación** (RF-61) → accede al **panel** (RF-63).
4. Alumno abre actividad (RF-64) → resuelve ejercicios (RF-60) con la cámara activa (RI-02); cada intento registra tiempo y resultado (RF-47).
5. El **motor adaptativo** sube/baja el nivel según desempeño + emoción (RF-01, RF-21); tras 3 fallos o a petición se muestra la **guía paso a paso** (RF-11, RF-45).
6. Si el índice de frustración supera el umbral → **alerta temprana** al docente (RF-16) con **guía de actuación** (RF-27).
7. Datos alimentan perfil estadístico (RF-19), reportes de tema (RF-18) y cruce académico-emocional (RF-52).

## 7. Mapa de la documentación

| Carpeta | Contenido |
|---|---|
| `specs/00-contexto` | ADR, convenciones, estado actual del repositorio |
| `specs/01-analisis` | Requerimientos normalizados, casos de uso, historias de usuario, trazabilidad |
| `specs/02-diseno` | Modelo de datos, funciones/triggers, seguridad, arquitectura frontend, API, navegación, wireframes |
| `specs/03-desarrollo` | Expects (EXP-01…EXP-07) y tareas atómicas |
| `specs/04-pruebas` | Pirámide, matriz, unitarias, rutas, BD, rendimiento, CI |
| `specs/05-guia` | Guía de implementación y ruta de ejecución para agentes |

## 8. Riesgos principales

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Costo de Rekognition (RC-04) | Alto | Muestreo cada 10 s, solo durante ejercicio, pausa con pestaña oculta, tope diario por alumno |
| Precisión emocional en niños | Medio | La emoción nunca decide sola: se combina con desempeño; umbrales configurables |
| Privacidad/consentimiento (RC-07, RC-08) | Alto | Consentimiento previo bloqueante, sin imágenes persistidas, auditoría, ARCO |
| Ambigüedades de la matriz | Medio | Resueltas en `01-analisis/requerimientos.md` §3; validar con el docente |
| Código existente desconocido | Medio | `00-contexto/estado-actual.md` define el inventario que el agente debe hacer primero |
