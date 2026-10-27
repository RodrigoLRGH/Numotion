import { defineDb, defineTable, column, NOW } from "astro:db";

// Modelo de datos FEEL-FACE (ver docs/specs/02-diseno/diseno/01-modelo-de-datos.md)
// Regla RC-05 / RNF-03: ninguna tabla almacena imágenes ni datos biométricos crudos.

const Usuario = defineTable({
    columns: {
        id: column.number({ primaryKey: true }),
        nombre: column.text(),
        // Identificador de inicio de sesión (correo para docente, usuario corto para alumno)
        usuario: column.text({ unique: true }),
        password_hash: column.text(),
        rol: column.text({ enum: ["docente", "alumno"] }),
        activo: column.boolean({ default: true }),
        creado_en: column.date({ default: NOW }),
    },
});

const Sesion = defineTable({
    columns: {
        id: column.number({ primaryKey: true }),
        token_hash: column.text({ unique: true }),
        id_usuario: column.number({ references: () => Usuario.columns.id }),
        expira_en: column.date(),
        creado_en: column.date({ default: NOW }),
    },
});

const Grupo = defineTable({
    columns: {
        id: column.number({ primaryKey: true }),
        id_docente: column.number({ references: () => Usuario.columns.id }),
        nombre: column.text(),
        grado: column.number(),
        ciclo: column.text(),
        creado_en: column.date({ default: NOW }),
    },
});

const Alumno = defineTable({
    columns: {
        id: column.number({ primaryKey: true }),
        id_usuario: column.number({ unique: true, references: () => Usuario.columns.id }),
        id_grupo: column.number({ references: () => Grupo.columns.id }),
        grado: column.number(),
        // RNF-10 / RC-08: consentimiento verificable de madre, padre o tutor
        consentimiento_tutor: column.boolean({ default: false }),
        tutor_nombre: column.text({ optional: true }),
        tutor_contacto: column.text({ optional: true }),
        consentimiento_fecha: column.date({ optional: true }),
        // Gamificación (RF-03, RF-66, RF-67, RF-68)
        puntos: column.number({ default: 0 }),
        racha_actual: column.number({ default: 0 }),
        mejor_racha: column.number({ default: 0 }),
        ultima_fecha_racha: column.text({ optional: true }), // YYYY-MM-DD (zona MX)
    },
});

const Tema = defineTable({
    columns: {
        id: column.number({ primaryKey: true }),
        clave: column.text({ unique: true }),
        nombre: column.text(),
        area: column.text(),
        descripcion: column.text(),
        tipo: column.text({ enum: ["academico", "ludico"] }),
        orden: column.number(),
    },
});

const DiagnosticoPanas = defineTable({
    columns: {
        id: column.number({ primaryKey: true }),
        id_alumno: column.number({ references: () => Alumno.columns.id }),
        fecha_sesion: column.text(), // YYYY-MM-DD: sesión de clase en curso
        respuestas: column.json(),
        afecto_positivo: column.number(),
        afecto_negativo: column.number(),
        creado_en: column.date({ default: NOW }),
    },
});

const DiagnosticoMatematico = defineTable({
    columns: {
        id: column.number({ primaryKey: true }),
        id_alumno: column.number({ references: () => Alumno.columns.id }),
        fecha_sesion: column.text(),
        respuestas: column.json(),
        aciertos: column.number(),
        total: column.number(),
        precision: column.number(), // 0..100
        tiempo_promedio_ms: column.number(),
        resultado_por_tema: column.json(), // { [claveTema]: { aciertos, total, nivel } }
        creado_en: column.date({ default: NOW }),
    },
});

const Actividad = defineTable({
    columns: {
        id: column.number({ primaryKey: true }),
        id_docente: column.number({ references: () => Usuario.columns.id }),
        nombre: column.text(),
        id_tema: column.number({ references: () => Tema.columns.id }),
        tipo_interaccion: column.text({ enum: ["seleccion_multiple", "arrastrar"] }),
        categoria: column.text({ enum: ["tarea", "trabajo_clase", "interrogacion"] }),
        num_ejercicios: column.number({ default: 5 }),
        fecha_asignacion: column.text(), // YYYY-MM-DD
        destino: column.text({ enum: ["grupo", "alumnos"] }),
        id_grupo: column.number({ optional: true, references: () => Grupo.columns.id }),
        creado_en: column.date({ default: NOW }),
    },
});

const AsignacionAlumno = defineTable({
    columns: {
        id: column.number({ primaryKey: true }),
        id_actividad: column.number({ references: () => Actividad.columns.id }),
        id_alumno: column.number({ references: () => Alumno.columns.id }),
        nivel_inicial: column.number(),
        nivel_actual: column.number(),
        estado: column.text({ enum: ["pendiente", "en_curso", "completada"], default: "pendiente" }),
        ejercicios_resueltos: column.number({ default: 0 }),
        aciertos: column.number({ default: 0 }),
        puntaje: column.number({ optional: true }), // 0..100 al completar
        // Ejercicio en curso (con respuesta y pasos): solo vive en servidor
        ejercicio_actual: column.json({ optional: true }),
        intentos_ejercicio: column.number({ default: 0 }),
        iniciada_en: column.date({ optional: true }),
        completada_en: column.date({ optional: true }),
    },
    indexes: [{ on: ["id_actividad", "id_alumno"], unique: true }],
});

const SesionPractica = defineTable({
    columns: {
        id: column.number({ primaryKey: true }),
        id_alumno: column.number({ references: () => Alumno.columns.id }),
        id_tema: column.number({ references: () => Tema.columns.id }),
        tipo_interaccion: column.text(),
        nivel_actual: column.number(),
        ejercicios_resueltos: column.number({ default: 0 }),
        aciertos: column.number({ default: 0 }),
        total_objetivo: column.number({ default: 5 }),
        ejercicio_actual: column.json({ optional: true }),
        intentos_ejercicio: column.number({ default: 0 }),
        completada_en: column.date({ optional: true }),
        creado_en: column.date({ default: NOW }),
    },
});

const Intento = defineTable({
    columns: {
        id: column.number({ primaryKey: true }),
        id_alumno: column.number({ references: () => Alumno.columns.id }),
        id_tema: column.number({ references: () => Tema.columns.id }),
        id_asignacion: column.number({ optional: true, references: () => AsignacionAlumno.columns.id }),
        id_practica: column.number({ optional: true, references: () => SesionPractica.columns.id }),
        nivel: column.number(),
        ejercicio: column.json(), // ejercicio presentado (sin datos personales)
        respuesta: column.text(),
        es_correcta: column.boolean(),
        numero_intento: column.number(), // 1..3 sobre el mismo ejercicio
        tiempo_ms: column.number(), // RF-47
        tipo_error: column.text({ optional: true }), // RF-19
        emocion: column.text({ optional: true }),
        uso_guia: column.boolean({ default: false }),
        creado_en: column.date({ default: NOW }),
    },
});

const RegistroEmocion = defineTable({
    columns: {
        id: column.number({ primaryKey: true }),
        id_alumno: column.number({ references: () => Alumno.columns.id }),
        id_tema: column.number({ optional: true, references: () => Tema.columns.id }),
        id_asignacion: column.number({ optional: true, references: () => AsignacionAlumno.columns.id }),
        emocion: column.text(), // catálogo Rekognition normalizado
        confianza: column.number(), // 0..1
        creado_en: column.date({ default: NOW }),
    },
});

const Alerta = defineTable({
    columns: {
        id: column.number({ primaryKey: true }),
        id_alumno: column.number({ references: () => Alumno.columns.id }),
        id_tema: column.number({ optional: true, references: () => Tema.columns.id }),
        id_asignacion: column.number({ optional: true, references: () => AsignacionAlumno.columns.id }),
        tipo: column.text({ enum: ["frustracion"] }),
        motivo: column.text(),
        guia_aceptada: column.boolean({ optional: true }), // RF-27: respuesta del alumno
        atendida: column.boolean({ default: false }),
        creado_en: column.date({ default: NOW }),
    },
});

const Nota = defineTable({
    columns: {
        id: column.number({ primaryKey: true }),
        id_docente: column.number({ references: () => Usuario.columns.id }),
        id_alumno: column.number({ references: () => Alumno.columns.id }),
        fecha: column.date({ default: NOW }),
        texto: column.text(),
        etiqueta: column.text({ optional: true }),
    },
});

const InsigniaAlumno = defineTable({
    columns: {
        id: column.number({ primaryKey: true }),
        id_alumno: column.number({ references: () => Alumno.columns.id }),
        clave: column.text(),
        otorgada_en: column.date({ default: NOW }),
    },
    indexes: [{ on: ["id_alumno", "clave"], unique: true }],
});

// https://astro.build/db/config
export default defineDb({
    tables: {
        Usuario,
        Sesion,
        Grupo,
        Alumno,
        Tema,
        DiagnosticoPanas,
        DiagnosticoMatematico,
        Actividad,
        AsignacionAlumno,
        SesionPractica,
        Intento,
        RegistroEmocion,
        Alerta,
        Nota,
        InsigniaAlumno,
    },
});
