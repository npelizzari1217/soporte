-- Saca la zona horaria operativa del tenant.
--
-- El enfoque de "una zona por cliente" se dio de baja: el instante ya vive en
-- UTC en las columnas `timestamptz`, y quien mira lo lee en el reloj de su
-- navegador. No hace falta que el tenant declare una zona, y una columna que
-- nadie consulta es una mentira esperando a que alguien la crea.
--
-- No hay pérdida de información: los dos tenants activos tenían el valor por
-- defecto `America/Argentina/Buenos_Aires`, que era el mismo backfill de la
-- migración que la creó.
ALTER TABLE "clientes"
  DROP COLUMN "zona_horaria";
