// Un componente por tipo_interaccion (04-arquitectura §4). Agregar un tipo = componente + entrada aquí.
import type { ComponentType } from "react";
import { EjercicioArrastrar } from "./EjercicioArrastrar";
import { EjercicioOpciones } from "./EjercicioOpciones";
import type { EjercicioProps } from "./tipos";

export const registroEjercicios: Partial<Record<string, ComponentType<EjercicioProps>>> = {
    seleccion_multiple: EjercicioOpciones,
    identificar_numero: EjercicioOpciones,
    completar_operacion: EjercicioOpciones,
    arrastrar: EjercicioArrastrar,
};
