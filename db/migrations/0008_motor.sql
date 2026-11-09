-- 0008 · Estado del motor de ejercicios (EXP-04).
-- ejercicio_actual_id: el ejercicio presentado y aún no cerrado (para retomar exactamente ahí).
-- ayuda_actual: el alumno abrió la guía en ese ejercicio (puntos tras guía = 3).
-- intento_ejercicio.resultado: respuesta que dio el servidor; un reintento con el mismo
-- cliente_id la devuelve tal cual (idempotencia, EXP-04.4).

ALTER TABLE asignacion_alumno
  ADD COLUMN ejercicio_actual_id uuid REFERENCES ejercicio(id),
  ADD COLUMN ayuda_actual boolean NOT NULL DEFAULT false;
GRANT UPDATE (ejercicio_actual_id, ayuda_actual) ON asignacion_alumno TO numotion_app;

ALTER TABLE intento_ejercicio ADD COLUMN resultado jsonb;

CREATE INDEX intento_ejercicio_asig_idx ON intento_ejercicio (asignacion_id, ejercicio_id, numero_intento);
