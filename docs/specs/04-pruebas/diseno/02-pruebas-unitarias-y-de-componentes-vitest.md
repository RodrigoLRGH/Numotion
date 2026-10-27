# Pruebas unitarias y de componentes (Vitest + React Testing Library)

## 1. Configuración
- `vitest.workspace.ts` con proyectos `api` (node), `web` (jsdom), `contracts` (node).
- `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `fast-check`, `msw`.
- Comando: `pnpm test` (todo), `pnpm test --project api`, `--coverage` (v8).

## 2. P-UNIT-01 · `decidirNivel` (tabla de verdad)

```ts
import { describe, it, expect } from 'vitest';
import { decidirNivel } from './decidirNivel';

const base = { nivelActual: 3, ultimos3: [], tiempoReferenciaMs: 30000, estadoVentana: 'neutral',
  IF: 0, erroresConsecutivos: 0, ejerciciosDesdeUltimoCambio: 5, aceptoAyuda: false } as const;
const ok = (t = 20000) => ({ correcto: true, correctoPrimerIntento: true, tiempoMs: t });
const ko = { correcto: false, correctoPrimerIntento: false, tiempoMs: 40000 };

describe('decidirNivel', () => {
  it.each([
    ['R1 IF alto baja',          { IF: 0.7 },                                              2, 'emocion'],
    ['R1 frustración + 2 errores', { estadoVentana: 'frustracion', erroresConsecutivos: 2 }, 2, 'combinado'],
    ['R2 aceptó ayuda',          { aceptoAyuda: true },                                    2, 'solicitud_ayuda'],
    ['R0 enfriamiento',          { ejerciciosDesdeUltimoCambio: 1, ultimos3: [ok(), ok(), ok()] }, 3, null],
    ['R1 ignora enfriamiento',   { ejerciciosDesdeUltimoCambio: 0, IF: 0.8 },              2, 'emocion'],
    ['R3 bajo desempeño',        { ultimos3: [ko, ko, ok()] },                             2, 'desempeno'],
    ['R4 dominio sube',          { ultimos3: [ok(), ok(), ok()] },                         4, 'desempeno'],
    ['R4 lento no sube',         { ultimos3: [ok(40000), ok(40000), ok(40000)] },          3, null],
    ['R5 desinterés re-engancha', { estadoVentana: 'desinteres', ultimos3: [ok(), ko, ok()] }, 4, 'emocion'],
  ])('%s', (_n, over, nivel, motivo) => {
    const r = decidirNivel({ ...base, ...over } as any);
    expect(r.nivelNuevo).toBe(nivel);
    expect(r.motivo).toBe(motivo);
  });

  it('nunca baja de 1 ni sube de 5', () => {
    expect(decidirNivel({ ...base, nivelActual: 1, IF: 0.9 } as any).nivelNuevo).toBe(1);
    expect(decidirNivel({ ...base, nivelActual: 5, ultimos3: [ok(), ok(), ok()] } as any).nivelNuevo).toBe(5);
  });

  it('propiedad: resultado siempre en [1,5] y |Δ| ≤ 1', () => {
    fc.assert(fc.property(arbEntradaAdaptativa, (e) => {
      const { nivelNuevo } = decidirNivel(e);
      return nivelNuevo >= 1 && nivelNuevo <= 5 && Math.abs(nivelNuevo - e.nivelActual) <= 1;
    }));
  });
});
```

## 3. P-UNIT-03 · RF-39 tolerancia
| Entrada | Esperado | Respuesta | Resultado |
|---|---|---|---|
| 15 | quince | `Quince` | ✓ (normaliza mayúsculas) |
| 15 | quince | `quinse` | ✓ (dist 1) |
| 15 | quince | `kinse` | ✗ (dist 2 > 1) |
| 23 | veintitrés | `veintitres` | ✓ (acento) |
| 23 | veintitrés | `veinte y tres` | ✓ (forma alternativa en lista de aceptadas) |
| 128 | ciento veintiocho | `siento veintiocho` | ✓ (len 17 → tolerancia 2) |
| 5 | cinco | `quince` | ✗ |

## 4. P-UNIT-02 · Índice de frustración
- E=1, errores=3, inactividad=60, ayudas=2 → IF = 1.0.
- Sin cámara, errores=3, inactividad=0, ayudas=0 → IF = 0.5 (pesos renormalizados).
- `evaluarAlerta`: [0.65] → no; [0.65, 0.61] → sí; segunda alerta a los 3 min → no; a los 6 min → sí.

## 5. P-COMP-01 · Ejercicios (patrón)
```tsx
it.each(Object.keys(registroEjercicios))('%s responde con teclado', async (tipo) => {
  const onResponder = vi.fn();
  render(<Ejercicio tipo={tipo} ejercicio={fixtures[tipo]} onResponder={onResponder} deshabilitado={false} />);
  await userEvent.tab();
  await userEvent.keyboard(accionesTeclado[tipo]);      // p. ej. {Enter} sobre la opción, o escribir "quince{Enter}"
  expect(onResponder).toHaveBeenCalledWith(respuestaEsperada[tipo]);
});
```
Además: objetivos táctiles ≥ 48 px (`getBoundingClientRect` con estilos computados en modo navegador de Vitest o en Playwright), botón de audio presente con `aria-label`.

## 6. P-COMP-02 / 03 / 04 / 05 (casos mínimos)
- `GuiaPasoAPaso`: inicia en paso 1; "Siguiente" revela paso 2; el paso con `revela_respuesta` solo aparece al final; modo `final` muestra todos + respuesta.
- `PerfilAlumno`: no renderiza ningún texto de `estadoEmocional`, AP ni AN aunque vengan en props (defensa).
- `RachaVisual`: racha 0 → "¡Empieza una nueva racha hoy!"; muestra L–V con días cumplidos.
- `FormularioAsignacion`: al elegir "Alumnos específicos" se limpia el grupo y viceversa; botón "Asignar" deshabilitado sin destino.
- `EscalaCaritas`: flechas izquierda/derecha cambian selección; cada carita tiene nombre accesible.

## 7. Protocolo P-UX-01 (RNF-06)
1. 10 alumnos del segmento (6–12 años, con consentimiento), uno a la vez, dispositivo con la app abierta en la tarea.
2. Instrucción única del facilitador: "Haz lo que te pide la pantalla". Sin más ayuda.
3. Tareas: escribir un número en palabras (RF-39), encontrar un número (RF-40), colorear una figura (RF-44, si existe).
4. Éxito = completa la tarea en ≤ 3 min sin ayuda. Registrar tiempo, errores y comentarios.
5. Criterio: ≥ 9 de 10 por tarea. Si falla, iterar UI y repetir con otros 10.
