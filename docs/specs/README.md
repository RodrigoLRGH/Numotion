# Specs — Numotion (MAES)

Especificaciones por fase para refactorizar `teds_project-main` en dos módulos funcionales: **Docente** y **Alumno**. Documento raíz: [`../SDD_Numotion.md`](../SDD_Numotion.md).

```
docs/
├─ SDD_Numotion.md                         Visión, alcance, arquitectura, componentes
├─ requerimientos.docx                     Matriz de clasificación (fuente)
└─ specs/
   ├─ 00-contexto/
   │  ├─ adr.md                            Decisiones de arquitectura (ADR-001…009)
   │  ├─ convenciones.md                   Idioma, IDs, carpetas, API, Git, DoD, a11y
   │  └─ estado-actual.md                  Inventario del repo y avance por Expect
   ├─ 01-analisis/
   │  ├─ requerimientos.md                 RF/RNF/RI/RC normalizados + ambigüedades A-01…A-16
   │  ├─ tareas.md                         T-00-xx, T-01-xx
   │  └─ diseno/
   │     ├─ 01-casos-de-uso-principales.md CU-01…CU-11
   │     ├─ 02-historias-de-usuario.md     HU-01…HU-29 (Gherkin)
   │     └─ 03-matriz-de-trazabilidad.md   RF → CU → HU → EXP → Prueba
   ├─ 02-diseno/
   │  ├─ requerimientos.md · tareas.md     T-02-xx
   │  └─ diseno/
   │     ├─ 01-modelo-de-datos-resumen-del-estado-final.md
   │     ├─ 02-funciones-triggers-y-reglas-migracion-0002.md   Racha, motor adaptativo, IF, triggers
   │     ├─ 03-seguridad-rls-resumen.md
   │     ├─ 04-arquitectura-frontend.md
   │     ├─ 05-contratos-de-api.md
   │     ├─ 06-navegacion-con-react-router-y-guardas-por-rol.md
   │     └─ 07-wireframes-estructura.md
   ├─ 03-desarrollo/
   │  ├─ requerimientos.md · tareas.md     T-03-<EXP>-nn (atómicas)
   │  └─ diseno/                           Expects EXP-01…EXP-07
   │     ├─ 01-expect-base-modulos-autenticacion-y-consentimiento.md
   │     ├─ 02-expect-diagnosticos-panas-c-y-matematico.md
   │     ├─ 03-expect-asignacion-y-seguimiento-de-actividades.md
   │     ├─ 04-expect-motor-de-ejercicios-y-adaptacion.md
   │     ├─ 05-expect-deteccion-emocional-y-alertas.md
   │     ├─ 06-expect-gamificacion-racha-e-insignias.md
   │     └─ 07-expect-dashboard-docente-perfil-y-reportes.md
   ├─ 04-pruebas/
   │  ├─ requerimientos.md · tareas.md     T-04-xx
   │  └─ diseno/
   │     ├─ 01-piramide-y-matriz-de-pruebas.md     P-UNIT/COMP/ROUTE/API/DB/INT/SEC/E2E/PERF/A11Y/UX
   │     ├─ 02-pruebas-unitarias-y-de-componentes-vitest.md
   │     ├─ 03-pruebas-de-rutas-y-guardas-react-router.md
   │     ├─ 04-pruebas-de-base-de-datos-pgtap.md
   │     ├─ 05-pruebas-de-rendimiento-y-concurrencia-k6.md
   │     └─ 06-pipeline-de-ci-github-actions.md
   └─ 05-guia/
      ├─ GUIA_IMPLEMENTACION.md            Cómo trabajar con agentes: lectura, ciclo, reglas, prompts
      └─ ruta-de-ejecucion.md              Orden de tareas por etapas y camino crítico
```

## Cómo empezar
1. Lee `05-guia/GUIA_IMPLEMENTACION.md`.
2. Ejecuta el prompt de arranque (§4.1): inventario del repo (T-00-01).
3. Sigue `05-guia/ruta-de-ejecucion.md`.

## Jerarquía de verdad
`requerimientos.docx` → `01-analisis/requerimientos.md` → `02-diseno` → `03-desarrollo` → código.
Si el código existente contradice un spec, se registra en `00-contexto/estado-actual.md` y se decide con un ADR.

## Nota
Estos specs se redactaron desde la matriz de requerimientos y el plan de negocios **sin acceso al código**. El stack (ADR-008) es una propuesta a confirmar con T-00-01/T-00-03.
