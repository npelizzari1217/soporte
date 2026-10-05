-- Rollback de 20261006120000_respuestas_predefinidas. DESTRUCTIVO: borra las respuestas
-- cargadas por el cliente (nadie más las referencia: el texto se copia al comentario).
DROP INDEX IF EXISTS "respuestas_predefinidas_titulo_lower_key";
DROP TABLE IF EXISTS "respuestas_predefinidas";
