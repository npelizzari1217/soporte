-- odd/edilicia-obra-externa T1b: items de servicio en compras (S2).
-- - es_servicio: el item contrata un servicio (mano de obra, obra externa) y no un insumo.
--   NOT NULL con DEFAULT false: las filas existentes quedan como bienes y nada cambia para ellas.
-- - El CHECK espeja la regla del dominio: un item de servicio no declara insumo, por lo que su
--   recepcion nunca suma stock.
ALTER TABLE "items_compra" ADD COLUMN "es_servicio" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "items_compra" ADD CONSTRAINT "items_compra_servicio_sin_insumo_check" CHECK (NOT "es_servicio" OR "insumo_id" IS NULL);
