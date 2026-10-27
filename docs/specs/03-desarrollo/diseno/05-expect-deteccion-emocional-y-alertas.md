# EXP-05 · Detección emocional, alertas tempranas y guía de actuación

**Cubre:** RI-02, RI-06, RNF-03, RC-03, RC-04, RC-05, RF-01 (factor emocional), RF-16, RF-27 · **HU:** HU-16, HU-17, HU-18 · **Depende de:** EXP-01, EXP-04

## Objetivo
Detectar el estado emocional del alumno durante la actividad sin almacenar ninguna imagen, alimentar al motor adaptativo y avisar al docente antes de que el alumno abandone, con una guía de cómo actuar.

## Expectativas verificables

| ID | Se espera que… | Verificación |
|---|---|---|
| EXP-05.1 | La cámara se solicite solo si hay consentimiento de cámara, solo en la pantalla de actividad, con indicador visible; se capture 1 frame cada `REKOGNITION_SAMPLE_SECONDS` [10] únicamente con pestaña visible y ejercicio activo; se apague al salir. Si el permiso se niega, la actividad continúe sin cámara y el docente vea "sin cámara". | P-E2E-04 |
| EXP-05.2 | `EmotionGateway.detectar(buffer)` llame a `DetectFaces` con bytes, devuelva emoción dominante + confianza y descarte el buffer; **ninguna** imagen llegue a disco, S3, BD ni logs. Tope por alumno: 1 frame/5 s y `REKOGNITION_DAILY_CAP_PER_ALUMNO` [400]/día; métrica `rekognition_calls_total`. | P-INT-01, P-SEC-03, P-SEC-06 |
| EXP-05.3 | Cada frame produzca un `evento_emocional` con `estado_derivado` según `02-…§3.1`, y el estado de ventana se calcule según la misma sección. | P-UNIT-07 |
| EXP-05.4 | El Índice de Frustración se calcule según `02-…§3.3` (con renormalización sin cámara) en cada intento y cada frame. | P-UNIT-02 |
| EXP-05.5 | Si IF ≥ 0.6 en 2 evaluaciones consecutivas se cree una `alerta` y se emita por SSE al docente del grupo en < 5 s; enfriamiento 5 min por (alumno, asignación); al alumno se le pregunte "¿Quieres que te ayude?". | P-API-07, P-E2E-03 |
| EXP-05.6 | La alerta enlace la `guia_actuacion` del estado detectado; el docente pueda verla paso a paso, marcarla atendida y dejar nota. Si el alumno acepta ayuda, se abra la guía del ejercicio y se aplique R2 (−1 nivel). | P-API-07, P-E2E-03 |

## EmotionGateway (API)
```ts
// core/emotion/emotionGateway.ts
const client = new RekognitionClient({ region: env.AWS_REGION });   // credenciales por rol IAM
export async function detectar(img: Buffer): Promise<Lectura> {
  try {
    const out = await client.send(new DetectFacesCommand({ Image: { Bytes: img }, Attributes: ['EMOTIONS'] }));
    const face = out.FaceDetails?.sort((a, b) => (b.BoundingBox?.Width ?? 0) - (a.BoundingBox?.Width ?? 0))[0];
    if (!face) return { emocion: 'SIN_ROSTRO', confianza: 0 };
    const top = face.Emotions!.sort((a, b) => b.Confidence! - a.Confidence!)[0];
    return { emocion: top.Type as EmocionRekognition, confianza: top.Confidence! };
  } finally {
    img.fill(0);                                                       // descarte explícito
  }
}
```
- Si hay varios rostros se usa el más grande (el alumno frente a su dispositivo, RC-03).
- Errores/timeout (3 s) → la muestra se ignora; nunca bloquea la actividad.

## Difusión SSE
- `AlertBus` en memoria (EventEmitter) + `LISTEN/NOTIFY alerta_nueva` de PostgreSQL para que funcione con varias instancias.
- Canal por `docente_id`; heartbeat `ping` cada 25 s.

## Estimación de costo (RC-04) — verificar precio vigente de Rekognition
`frames/día = alumnos × minutos_actividad × 60 / intervalo`. Ej.: 30 alumnos × 20 min × 6 frames/min = 3 600 imágenes/día por grupo. Configurar `REKOGNITION_SAMPLE_SECONDS` y el tope diario según presupuesto; tablero de CloudWatch con costo estimado.

## Fuera de alcance
Reconocimiento de identidad facial (prohibido); análisis de voz; uso de la cámara fuera de las actividades.
