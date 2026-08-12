-- Remover el catálogo "ubicaciones" (árbol padre/hijo) por completo: ya no se
-- usa. La única referencia real era `ticket_edilicia.ubicacion_id` (FK NOT
-- NULL) — se convierte en texto libre nullable, preservando el dato actual
-- vía backfill con el `nombre` de la ubicación referenciada ANTES de dropear
-- la FK y la tabla.

-- 1) Nueva columna de texto libre (nullable).
ALTER TABLE "ticket_edilicia" ADD COLUMN "ubicacion" VARCHAR(255);

-- 2) Backfill: preserva el nombre de la ubicación actual de cada reparación.
UPDATE "ticket_edilicia" t
SET "ubicacion" = u."nombre"
FROM "ubicaciones" u
WHERE t."ubicacion_id" = u."id";

-- 3) Dropea la columna FK (Postgres elimina su constraint y su índice
--    `@@index([ubicacionId])` automáticamente).
ALTER TABLE "ticket_edilicia" DROP COLUMN "ubicacion_id";

-- 4) Dropea el catálogo completo (self-FK + índices se eliminan con la tabla).
DROP TABLE "ubicaciones";
