// CP53 · P-PERF-01/02 (RNF-01, RNF-02). Prueba de carga sin dependencias: N alumnos a la vez resuelven
// actividades por HTTP durante D segundos (con una pausa de "niño" entre toques) y se mide el p95 de
// cada interacción. Al final mide los contenidos con procesamiento adicional: guía paso a paso,
// resumen socioemocional del grupo, reporte por tema y, si OpenAI está activo en el servidor, una
// historia nueva.
//
// Uso:  node --env-file=.env scripts/rendimiento.mjs [--base http://localhost:3100] [--alumnos 30] [--segundos 300]
// Prepara los datos con DATABASE_OWNER_URL (consentimiento y diagnósticos del día). Solo contra una BD
// local o de pruebas: crea un docente, un grupo y alumnos nuevos.
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("base", "http://localhost:3100");
const ALUMNOS = Number(arg("alumnos", 30));
const SEGUNDOS = Number(arg("segundos", 300));
const PAUSA_MS = [800, 2000]; // un niño no toca más rápido que esto
const owner = postgres(process.env.DATABASE_OWNER_URL, { max: 2, onnotice: () => {} });

/** Cliente HTTP con cookie propia; registra la latencia de cada llamada bajo una etiqueta. */
const medidas = new Map();
function cliente() {
    let cookie = "";
    return async (etiqueta, metodo, ruta, cuerpo) => {
        const t0 = performance.now();
        const r = await fetch(BASE + "/api/v1" + ruta, {
            method: metodo,
            headers: { "content-type": "application/json", cookie, origin: BASE },
            body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        });
        const ms = performance.now() - t0;
        const c = r.headers.getSetCookie?.() ?? [];
        if (c.length) cookie = c.map((x) => x.split(";")[0]).join("; ");
        const texto = await r.text();
        if (etiqueta) {
            if (!medidas.has(etiqueta)) medidas.set(etiqueta, { ms: [], errores: 0 });
            const m = medidas.get(etiqueta);
            m.ms.push(ms);
            if (r.status >= 500) m.errores++;
        }
        return { status: r.status, body: texto ? JSON.parse(texto) : null, ms };
    };
}
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; };
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
const pausa = () => dormir(PAUSA_MS[0] + Math.random() * (PAUSA_MS[1] - PAUSA_MS[0]));

async function preparar() {
    const d = cliente();
    const sufijo = Date.now().toString(36);
    const email = `carga.${sufijo}@escuela.mx`;
    const reg = await d(null, "POST", "/auth/docente/registro", { nombre: "Docente Carga", email, password: "contraseña-carga", aceptaAviso: true });
    if (reg.status >= 300) throw new Error(`registro ${reg.status} ${JSON.stringify(reg.body)}`);
    const grupo = (await d(null, "POST", "/docente/grupos", { nombre: "Carga", grado: 3, cicloEscolar: "2026-2027" })).body;
    const alumnos = [];
    for (let i = 0; i < ALUMNOS; i++) {
        const a = await d(null, "POST", `/docente/grupos/${grupo.id}/alumnos`, { nombre: `Carga${i}`, tutorNombre: "Tutor", tutorEmail: "t@ejemplo.mx" });
        if (a.status !== 201) throw new Error(`alta ${a.status} ${JSON.stringify(a.body)}`);
        alumnos.push({ id: a.body.alumno.id, pin: a.body.pin });
    }
    const ids = alumnos.map((a) => a.id);
    await owner`UPDATE consentimiento_tutor SET aceptado_en = now(), acepta_plataforma = true, acepta_camara = true WHERE alumno_id = ANY(${ids}::uuid[])`;
    for (const id of ids) {
        const [s] = await owner`INSERT INTO sesion_alumno (alumno_id, fecha) VALUES (${id}, fn_hoy_local()) RETURNING id`;
        await owner`INSERT INTO panas_resultado (sesion_id, alumno_id, afecto_positivo, afecto_negativo, completado_en) VALUES (${s.id}, ${id}, 4, 1.5, now())`;
        await owner`INSERT INTO retroalimentacion (sesion_id, alumno_id, estado_inicial) VALUES (${s.id}, ${id}, 'positivo')`;
    }
    const temas = (await d(null, "GET", "/catalogo/temas")).body.items;
    const [{ hoy }] = await owner`SELECT to_char(fn_hoy_local(), 'YYYY-MM-DD') AS hoy`;
    // Suficientes ejercicios para que nadie se quede sin actividad en D segundos
    const combinaciones = [["suma", "seleccion_multiple"], ["resta", "completar_operacion"], ["numeros", "identificar_numero"], ["suma", "suma_figuras"]];
    const porActividad = 30;
    const necesarias = Math.ceil(SEGUNDOS / (PAUSA_MS[0] / 1000) / 2 / porActividad) + 1;
    for (let i = 0; i < necesarias; i++) {
        const [clave, tipo] = combinaciones[i % combinaciones.length];
        const r = await d(null, "POST", "/docente/actividades", {
            nombre: `Carga ${i}`, temaId: temas.find((t) => t.clave === clave).id, tipoInteraccion: tipo,
            fechaAsignacion: hoy, numEjercicios: porActividad, destino: { tipo: "grupo", grupoId: grupo.id },
        });
        if (r.status !== 201) throw new Error(`actividad ${r.status} ${JSON.stringify(r.body)}`);
    }
    return { docente: d, grupoId: grupo.id, alumnos };
}

/** Un alumno: entra, abre su panel y resuelve ejercicios hasta que se acaba el tiempo. */
async function alumno(grupoId, { id, pin }, hasta, cuenta) {
    const c = cliente();
    const login = await c("login", "POST", "/auth/alumno/login", { grupoId, alumnoId: id, pin });
    if (login.status !== 200) throw new Error(`login ${login.status} ${JSON.stringify(login.body)}`);
    await c("panel", "GET", "/alumno/panel");
    while (Date.now() < hasta) {
        const lista = (await c("actividades", "GET", "/alumno/actividades")).body.items.filter((a) => a.estado !== "completada");
        if (!lista.length) break;
        const asignacionId = lista[0].asignacionId;
        let sig = await c("siguiente", "POST", `/alumno/actividades/${asignacionId}/iniciar`);
        while (Date.now() < hasta && sig.body?.ejercicio) {
            const ej = sig.body.ejercicio;
            await pausa();
            if (Math.random() < 0.1) await c("guia", "POST", `/alumno/ejercicios/${ej.id}/guia`, { asignacionId });
            const [fila] = await owner`SELECT respuesta->>'valor' AS valor FROM ejercicio WHERE id = ${ej.id}`;
            const bien = Math.random() < 0.7;
            const r = await c("intento", "POST", "/alumno/intentos", {
                clienteId: randomUUID(), asignacionId, ejercicioId: ej.id, respuesta: bien ? fila.valor : "-999",
                tiempoMs: 4000, ayudaSolicitada: false,
            });
            if (r.status !== 201) { cuenta.fallos++; break; }
            cuenta.intentos++;
            if (r.body.asignacion.estado === "completada") break;
            if (r.body.ejercicioCerrado) sig = await c("siguiente", "GET", `/alumno/actividades/${asignacionId}/siguiente`);
        }
    }
}

const fila = (n, m) => {
    const r = { interaccion: n, n: m.ms.length, p50_ms: Math.round(pct(m.ms, 50)), p95_ms: Math.round(pct(m.ms, 95)), max_ms: Math.round(Math.max(...m.ms)), errores_5xx: m.errores };
    return r;
};

console.log(`Base ${BASE} · ${ALUMNOS} alumnos · ${SEGUNDOS} s`);
const { docente, grupoId, alumnos } = await preparar();
const cuenta = { intentos: 0, fallos: 0 };
const t0 = Date.now();
await Promise.all(alumnos.map((a) => alumno(grupoId, a, t0 + SEGUNDOS * 1000, cuenta)));
const duracion = (Date.now() - t0) / 1000;

const interacciones = ["login", "panel", "actividades", "siguiente", "intento"].filter((n) => medidas.has(n)).map((n) => fila(n, medidas.get(n)));
const todas = { ms: interacciones.flatMap((r) => medidas.get(r.interaccion).ms), errores: interacciones.reduce((s, r) => s + r.errores_5xx, 0) };

// RNF-02: contenido con procesamiento adicional, una vez terminada la carga
const [{ hoy }] = await owner`SELECT to_char(fn_hoy_local(), 'YYYY-MM-DD') AS hoy`;
for (let i = 0; i < 5; i++) {
    await docente("resumen_grupo", "GET", `/docente/grupos/${grupoId}/resumen?fecha=${hoy}`);
    await docente("reporte_temas", "GET", `/docente/grupos/${grupoId}/reportes/temas`);
}
// Historia nueva con OpenAI (si el servidor lo tiene activo): un alumno con interés y una actividad nueva
await owner`UPDATE alumno SET intereses = '{animales}' WHERE id = ${alumnos[0].id}`;
const temas = (await docente(null, "GET", "/catalogo/temas")).body.items;
const historias = [];
const TEMAS_HISTORIA = ["suma", "resta", "multiplicacion", "division"];
for (let i = 0; i < TEMAS_HISTORIA.length; i++) {
    const tema = temas.find((t) => t.clave === TEMAS_HISTORIA[i]);
    if (!tema?.tiposInteraccion.includes("seleccion_multiple")) continue;
    const act = await docente(null, "POST", "/docente/actividades", {
        nombre: `Historia ${i}`, temaId: tema.id, tipoInteraccion: "seleccion_multiple",
        fechaAsignacion: hoy, numEjercicios: 3, destino: { tipo: "alumnos", alumnoIds: [alumnos[0].id] },
    });
    if (act.status !== 201) { console.log("actividad historia", act.status, JSON.stringify(act.body)); break; }
    const c = cliente();
    await c(null, "POST", "/auth/alumno/login", { grupoId, alumnoId: alumnos[0].id, pin: alumnos[0].pin });
    const [asig] = await owner`SELECT id FROM asignacion_alumno WHERE actividad_id = ${act.body.id ?? act.body.actividadId} AND alumno_id = ${alumnos[0].id}`;
    const antes = new Date();
    const r = await c("historia", "POST", `/alumno/actividades/${asig.id}/iniciar`);
    const [e] = await owner`SELECT origen, creado_en >= ${antes} AS nueva FROM ejercicio WHERE id = ${r.body.ejercicio.id}`;
    // origen openai + nueva = generada en esta petición; openai sin nueva = reusada de la caché
    historias.push({ tema: TEMAS_HISTORIA[i], ms: Math.round(r.ms), origen: e.origen, generada_ahora: e.nueva });
}

const contenido = ["guia", "resumen_grupo", "reporte_temas", "historia"].filter((n) => medidas.has(n)).map((n) => fila(n, medidas.get(n)));
const resultado = {
    fecha: new Date().toISOString(), base: BASE, alumnos: ALUMNOS, duracion_s: Math.round(duracion),
    intentos_registrados: cuenta.intentos, intentos_rechazados: cuenta.fallos,
    rnf01: { interacciones, global: { n: todas.ms.length, p95_ms: Math.round(pct(todas.ms, 95)), errores_5xx: todas.errores }, cumple: pct(todas.ms, 95) <= 2000 && todas.errores === 0 },
    rnf02: { contenido, historias, cumple: contenido.every((r) => r.max_ms <= 30_000) },
};
console.log(JSON.stringify(resultado, null, 2));
await owner.end();
