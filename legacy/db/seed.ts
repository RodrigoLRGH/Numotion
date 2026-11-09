import {
    db,
    Nivel,
    Usuario,
    Subtema,
    Actividad,
    Opcion,
    Respuesta,
    Recomendacion,
    Progreso,
    Emocion,
} from "astro:db";

// https://astro.build/db/seed
export default async function seed() {
    // Insert default levels
    await db.insert(Nivel).values([
        {
            id_nivel: 1,
            nombre_nivel: "Básico",
            descripcion: "Nivel introductorio para conceptos fundamentales",
            objetivo: "Entender conceptos básicos",
        },
        {
            id_nivel: 2,
            nombre_nivel: "Intermedio",
            descripcion: "Consolida y amplía lo aprendido en Básico",
            objetivo: "Resolver problemas de complejidad media",
        },
        {
            id_nivel: 3,
            nombre_nivel: "Avanzado",
            descripcion: "Profundiza en temas complejos y evaluaciones finales",
            objetivo: "Aplicar conocimientos en contextos avanzados",
        },
    ]);

    // Insert default users
    await db.insert(Usuario).values([
        {
            id_usuario: 1,
            nombre: "Admin User",
            correo: "admin@example.com",
            contraseña: "adminpass",
            rol: "admin",
            fecha_registro: new Date("2025-01-01"),
            nivel_actual: 3,
        },
        {
            id_usuario: 2,
            nombre: "Docente Uno",
            correo: "teacher@example.com",
            contraseña: "teacherpass",
            rol: "docente",
            fecha_registro: new Date("2025-02-01"),
            nivel_actual: 2,
        },
        {
            id_usuario: 3,
            nombre: "Estudiante Uno",
            correo: "student@example.com",
            contraseña: "studentpass",
            rol: "estudiante",
            fecha_registro: new Date("2025-03-01"),
            nivel_actual: 1,
        },
    ]);

    // Subtopics (Subtema)
    await db.insert(Subtema).values([
        {
            id_subtema: 1,
            id_nivel: 1,
            nombre_subtema: "Sumas básicas",
            dificultad: "baja",
            descripcion: "Introducción a la suma con números pequeños",
            orden: 1,
        },
        {
            id_subtema: 2,
            id_nivel: 1,
            nombre_subtema: "Restas básicas",
            dificultad: "baja",
            descripcion: "Introducción a la resta",
            orden: 2,
        },
        {
            id_subtema: 3,
            id_nivel: 2,
            nombre_subtema: "Multiplicación",
            dificultad: "media",
            descripcion: "Tablas y estrategias de multiplicación",
            orden: 1,
        },
    ]);

    // Activities (Actividad)
    await db.insert(Actividad).values([
        {
            id_actividad: 1,
            id_subtema: 1,
            tipo: "teorica",
            descripcion: "Introducción a la suma y conceptos básicos",
            recurso_url: "",
            fecha_creacion: new Date("2025-03-10"),
            fecha_actualizacion: new Date("2025-03-10"),
        },
        {
            id_actividad: 2,
            id_subtema: 1,
            tipo: "evaluacion",
            descripcion: "Pequeña evaluación: suma de números de un dígito",
            recurso_url: "",
            fecha_creacion: new Date("2025-03-11"),
            fecha_actualizacion: new Date("2025-03-11"),
        },
        {
            id_actividad: 3,
            id_subtema: 3,
            tipo: "practica",
            descripcion: "Practica de tablas de multiplicar",
            recurso_url: "",
            fecha_creacion: new Date("2025-03-12"),
            fecha_actualizacion: new Date("2025-03-12"),
        },
        {
            id_actividad: 999, // Acitivdad exclusiva para PANAS
            id_subtema: 1, // asociación random con un subtema existente
            tipo: "panas",
            descripcion: "Actividad especial para almacenar resultados del cuestionario PANAS",
            recurso_url: "",
            fecha_creacion: new Date("2025-11-07"),
            fecha_actualizacion: new Date("2025-11-07"),
        },
    ]);


    // Options for activities (Opcion)
    await db.insert(Opcion).values([
        {
            id_opcion: 1,
            id_actividad: 2,
            texto_opcion: "2",
            es_correcta: false,
        },
        { id_opcion: 2, id_actividad: 2, texto_opcion: "4", es_correcta: true },
        {
            id_opcion: 3,
            id_actividad: 2,
            texto_opcion: "5",
            es_correcta: false,
        },
        {
            id_opcion: 4,
            id_actividad: 3,
            texto_opcion: "Tabla del 2",
            es_correcta: true,
        },
    ]);

    // Sample responses (Respuesta)
    await db.insert(Respuesta).values([
        {
            id_respuesta: 1,
            id_usuario: 3,
            id_actividad: 2,
            id_opcion: 2,
            respuesta: "4",
            es_correcta: true,
            fecha_respuesta: new Date("2025-03-11T10:00:00Z"),
        },
    ]);

    // Recommendations (Recomendacion)
    await db.insert(Recomendacion).values([
        {
            id_recomendacion: 1,
            id_usuario: 3,
            id_actividad: 2,
            tipo: "avanzar",
            mensaje: "Buen trabajo — puedes continuar al siguiente subtema.",
            fecha_generada: new Date("2025-03-11T10:05:00Z"),
        },
    ]);

    // Progress (Progreso)
    await db.insert(Progreso).values([
        {
            id_progreso: 1,
            id_usuario: 3,
            id_nivel: 1,
            porcentaje_completado: 50,
            promedio_puntaje: 80,
            emocion_predominante: "motivado",
            fecha_ultima_actividad: new Date("2025-03-11T10:00:00Z"),
        },
    ]);

    // Emotions (Emocion)
    await db.insert(Emocion).values([
        {
            id_emocion: 1,
            id_usuario: 3,
            id_actividad: 2,
            tipo_emocion: "feliz",
            intensidad: 7,
            fecha_registro: new Date("2025-03-11T10:01:00Z"),
        },
    ]);
}
