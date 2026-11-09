-- 0010 · Generación con OpenAI (T-03-04-20, EXP-04.7, ADR-007).
-- uso_openai: gasto estimado del mes (presupuesto OPENAI_MONTHLY_BUDGET_USD, RC-04). La app no la
-- toca directamente: reserva la cota de cada llamada antes de hacerla y luego la ajusta al costo real
-- con dos funciones SECURITY DEFINER, de forma atómica aunque haya muchas peticiones a la vez.
-- La caché de historias es la propia tabla ejercicio (origen = 'openai', respuesta->>'contexto').

CREATE TABLE uso_openai (
  mes            date PRIMARY KEY,
  costo_usd      numeric(12,6) NOT NULL DEFAULT 0 CHECK (costo_usd >= 0),
  llamadas       int NOT NULL DEFAULT 0,
  rechazadas     int NOT NULL DEFAULT 0,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE uso_openai ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON uso_openai FROM PUBLIC, numotion_app;

-- Reserva p_costo si cabe en p_limite; devuelve false (y cuenta el rechazo) si no cabe.
CREATE FUNCTION fn_openai_reservar(p_costo numeric, p_limite numeric) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mes date := date_trunc('month', fn_hoy_local())::date;
BEGIN
  IF NOT es_alumno() THEN RAISE EXCEPTION 'Solo en contexto de alumno' USING ERRCODE = '42501'; END IF;
  IF p_costo IS NULL OR p_costo < 0 OR p_limite IS NULL THEN RAISE EXCEPTION 'Costo inválido' USING ERRCODE = '22023'; END IF;
  INSERT INTO uso_openai (mes) VALUES (v_mes) ON CONFLICT (mes) DO NOTHING;
  UPDATE uso_openai SET costo_usd = costo_usd + p_costo, llamadas = llamadas + 1, actualizado_en = now()
   WHERE mes = v_mes AND costo_usd + p_costo <= p_limite;
  IF FOUND THEN RETURN true; END IF;
  UPDATE uso_openai SET rechazadas = rechazadas + 1, actualizado_en = now() WHERE mes = v_mes;
  RETURN false;
END $$;

-- Corrige la reserva con el costo real (p_delta negativo = devolver lo que no se gastó).
CREATE FUNCTION fn_openai_ajustar(p_delta numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT es_alumno() THEN RAISE EXCEPTION 'Solo en contexto de alumno' USING ERRCODE = '42501'; END IF;
  UPDATE uso_openai SET costo_usd = greatest(0, costo_usd + coalesce(p_delta, 0)), actualizado_en = now()
   WHERE mes = date_trunc('month', fn_hoy_local())::date;
END $$;

GRANT EXECUTE ON FUNCTION fn_openai_reservar(numeric, numeric), fn_openai_ajustar(numeric) TO numotion_app;

-- Caché por (tema, tipo, nivel, interés): búsqueda de historias ya generadas
CREATE INDEX ejercicio_openai_cache_idx ON ejercicio (tema_id, tipo_interaccion, nivel, (respuesta->>'contexto'))
  WHERE origen = 'openai' AND activo;
