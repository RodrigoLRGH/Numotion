# EXP-02 · Diagnósticos de sesión (PANAS-C y matemático), retroalimentación y desbloqueo del panel

**Cubre:** RF-54, RF-55, RF-61, RF-63 · **HU:** HU-04, HU-05, HU-06 · **Depende de:** EXP-01

## Objetivo
Que cada alumno, al iniciar el día, deje un registro de cómo llega emocionalmente (PANAS-C) y de su dominio por tema, y que esa triangulación quede guardada como retroalimentación disponible para el docente y para el nivel inicial de las actividades.

## Expectativas verificables

| ID | Se espera que… | Verificación |
|---|---|---|
| EXP-02.1 | El alumno responda PANAS-C con escala pictográfica de 5 caras, un ítem por pantalla, con audio; las respuestas se guarden de forma incremental; al finalizar se calculen AP y AN (promedio 1–5) y se registren. | P-UNIT-05, P-E2E-01 |
| EXP-02.2 | El diagnóstico matemático presente preguntas escalonadas por cada tema del grado (3–5 por tema), registre aciertos, tiempo y `nivel_dominio` 1–5 por tema según `02-…§3.6`. | P-UNIT-06, P-E2E-01 |
| EXP-02.3 | Al finalizar ambos, se cree **una** `retroalimentacion` por sesión con `estado_inicial` (`02-…§3.2`), dominio y nivel sugerido por tema; la operación sea idempotente. | P-API-03 |
| EXP-02.4 | El panel y las actividades del alumno sean inaccesibles (cliente y API) hasta completar ambos diagnósticos del día; al cambiar de día se vuelvan a pedir. | P-ROUTE-02, P-API-03 |
| EXP-02.5 | Si el alumno sale a la mitad, retome exactamente donde quedó. | P-E2E-01 (paso) |
| EXP-02.6 | Con diagnóstico matemático completo en los últimos 7 días, se aplique la versión corta (1 pregunta por tema) — configurable en `config_adaptativa.diagnostico_corto_dias`. | P-API-03 |

## Componentes
- API: `modules/alumno/diagnostico.routes.ts`, `core/diagnostico/{panas.ts, matematico.ts, retroalimentacion.ts}`.
- Web: `modules/alumno/pages/{PanasC, DiagnosticoMatematico}`, `components/EscalaCaritas`, `shared/audio/useSpeak`.

## Reglas clave
```ts
export function calcularPanas(respuestas: {afecto: 'positivo'|'negativo'; valor: 1|2|3|4|5}[]) {
  const prom = (a: number[]) => Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 100) / 100;
  return {
    afectoPositivo: prom(respuestas.filter(r => r.afecto === 'positivo').map(r => r.valor)),
    afectoNegativo: prom(respuestas.filter(r => r.afecto === 'negativo').map(r => r.valor)),
  };
}
```
- Los ítems definitivos de PANAS-C dependen de T-01-03. Propuesta inicial (forma breve, 10 ítems, **a validar**): positivos *alegre, contento/a, feliz, con energía, orgulloso/a*; negativos *triste, enojado/a, asustado/a, con miedo, desanimado/a*.
- El alumno **nunca** ve sus puntajes AP/AN ni su `estado_inicial`.

## Fuera de alcance
Interpretación clínica; el sistema no diagnostica condiciones de salud mental.
