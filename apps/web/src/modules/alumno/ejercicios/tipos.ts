// Contrato entre el motor del cliente y cada componente de ejercicio (04-arquitectura §4).

export interface EjercicioPublico {
    id: string;
    tipoInteraccion: string;
    nivel: number;
    enunciado: string;
    expresion?: string;
    figuras?: { emoji: string; cantidad: number }[];
    numeroMostrado?: number;
    opciones?: string[];
    /** Colorear (RF-44): figuras a pintar e instrucción */
    lienzo?: { figuras: { id: string; tipo: string }[]; instruccion: { tipo: string; color: string } };
    /** null cuando la respuesta no es cerrada (texto con tolerancia, coloreo): solo valida el servidor */
    hashRespuesta: string | null;
}

export interface EjercicioProps {
    ejercicio: EjercicioPublico;
    /** Respuestas ya intentadas y erróneas en este ejercicio: se muestran tachadas */
    descartadas: readonly string[];
    deshabilitado: boolean;
    onResponder(respuesta: string): void;
}
