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
    hashRespuesta: string;
}

export interface EjercicioProps {
    ejercicio: EjercicioPublico;
    /** Opciones ya intentadas y erróneas en este ejercicio: se muestran tachadas */
    descartadas: readonly string[];
    deshabilitado: boolean;
    onResponder(respuesta: string): void;
}
