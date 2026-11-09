// Representación de un ejercicio guardado en BD, compartida por el motor de actividades (EXP-04) y
// la práctica libre (EXP-06.6): fila → Ejercicio del dominio y → EjercicioPublico (sin la respuesta).
import { createHash } from "node:crypto";
import type { TipoInteraccionActividad } from "@numotion/core/dominio/catalogo";
import { validacionLocal } from "@numotion/core/dominio/contenido";
import type { Ejercicio } from "@numotion/core/dominio/ejercicios";
import { textoParaHash } from "@numotion/core/dominio/respuesta";
import { Prisma, type Tx } from "../../infra/db";

/** Valor para una columna jsonb (sin `undefined`, que Prisma rechaza). */
export const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

export interface FilaEjercicio {
    id: string;
    nivel: number;
    tipo_interaccion: string;
    enunciado: { texto: string; expresion?: string; figuras?: Ejercicio["figuras"]; numeroMostrado?: number; lienzo?: Ejercicio["lienzo"] };
    opciones: string[] | null;
    respuesta: { valor: string; generador: Ejercicio["tema"]; datos: Ejercicio["datos"] };
    pasos_solucion: { orden: number; texto: string }[];
}

export interface EjercicioPublico {
    id: string;
    tipoInteraccion: string;
    nivel: number;
    enunciado: string;
    expresion?: string;
    figuras?: Ejercicio["figuras"];
    numeroMostrado?: number;
    lienzo?: Ejercicio["lienzo"];
    opciones?: string[];
    /**
     * SHA-256 de `${id}:${respuesta normalizada}`: validación optimista en el cliente (EXP-04.8).
     * null en texto libre y coloreo, donde solo el servidor puede decidir (validacionLocal).
     */
    hashRespuesta: string | null;
}

export function hashRespuesta(ejercicioId: string, valor: string): string {
    return createHash("sha256").update(textoParaHash(ejercicioId, valor)).digest("hex");
}

export function aEjercicio(f: FilaEjercicio): Ejercicio {
    return {
        tema: f.respuesta.generador,
        nivel: f.nivel,
        interaccion: "seleccion_multiple",
        enunciado: f.enunciado.texto,
        expresion: f.enunciado.expresion,
        opciones: f.opciones ?? undefined,
        figuras: f.enunciado.figuras,
        numeroMostrado: f.enunciado.numeroMostrado,
        lienzo: f.enunciado.lienzo,
        respuesta: f.respuesta.valor,
        pasos: f.pasos_solucion.map((p) => p.texto),
        datos: f.respuesta.datos,
    };
}

export function aPublico(f: FilaEjercicio): EjercicioPublico {
    return {
        id: f.id,
        tipoInteraccion: f.tipo_interaccion,
        nivel: f.nivel,
        enunciado: f.enunciado.texto,
        ...(f.enunciado.expresion ? { expresion: f.enunciado.expresion } : {}),
        ...(f.enunciado.figuras ? { figuras: f.enunciado.figuras } : {}),
        ...(f.enunciado.numeroMostrado !== undefined ? { numeroMostrado: f.enunciado.numeroMostrado } : {}),
        ...(f.enunciado.lienzo ? { lienzo: f.enunciado.lienzo } : {}),
        ...(f.opciones ? { opciones: f.opciones } : {}),
        hashRespuesta: validacionLocal(f.respuesta.generador) ? hashRespuesta(f.id, f.respuesta.valor) : null,
    };
}

export const columnasEjercicio = { id: true, nivel: true, tipo_interaccion: true, enunciado: true, opciones: true, respuesta: true, pasos_solucion: true } as const;

export const cargarEjercicio = async (tx: Tx, id: string) =>
    (await tx.ejercicio.findUniqueOrThrow({ where: { id }, select: columnasEjercicio })) as unknown as FilaEjercicio;

/** Guarda un ejercicio generado (generador determinista u OpenAI) para poder calificarlo después. */
export async function insertarEjercicio(
    tx: Tx,
    destino: { temaId: string; tipo: TipoInteraccionActividad; nivel: number },
    e: Ejercicio,
    origen: "generador" | "openai",
    contexto?: string,
): Promise<FilaEjercicio> {
    return (await tx.ejercicio.create({
        data: {
            tema_id: destino.temaId,
            tipo_interaccion: destino.tipo,
            nivel: destino.nivel,
            enunciado: json({ texto: e.enunciado, expresion: e.expresion, figuras: e.figuras, numeroMostrado: e.numeroMostrado, lienzo: e.lienzo }),
            respuesta: json({ valor: e.respuesta, generador: e.tema, datos: e.datos, ...(contexto ? { contexto } : {}) }),
            opciones: e.opciones ? json(e.opciones) : Prisma.DbNull,
            pasos_solucion: json(e.pasos.map((texto, i) => ({ orden: i + 1, texto }))),
            origen,
        },
        select: columnasEjercicio,
    })) as unknown as FilaEjercicio;
}
