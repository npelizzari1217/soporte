-- Rollback de M2 (compras-tres-etapas-y-sectores, WU-17). Inverso EXACTO y
-- SIMÉTRICO — pero SOLO seguro mientras el invariante de reversibilidad se
-- mantiene: ninguna fila registró una orden por encima de lo recibido.
--
-- Verificar ANTES de correr este archivo:
--   SELECT count(*) FROM items_compra WHERE cantidad_ordenada <> cantidad_recibida;
-- Si el resultado es > 0, este rollback PIERDE datos de `cantidad_ordenada`
-- (no hay de dónde recuperarla) — no ejecutar sin decisión explícita de
-- aceptar esa pérdida.

-- 6 (inverso) · bitácora: catálogo de 10 valores, sin ORDEN_REGISTRADA/RECEPCION_REGISTRADA.
ALTER TABLE "operaciones_compra" DROP CONSTRAINT "operaciones_compra_tipo_check";
ALTER TABLE "operaciones_compra" ADD CONSTRAINT "operaciones_compra_tipo_check" CHECK ("tipo" IN (
    'CREACION',
    'ITEM_AGREGADO',
    'ITEM_EDITADO',
    'ITEM_ELIMINADO',
    'ITEM_APROBADO',
    'ITEM_RECHAZADO',
    'COMPRA_REGISTRADA',
    'ENTREGA_REGISTRADA',
    'ITEM_CERRADO_CON_FALTANTE',
    'CANCELACION'
));

-- 5 (inverso) · drop del CHECK de orden cronológico de fechas.
ALTER TABLE "items_compra" DROP CONSTRAINT "items_compra_fechas_orden_check";

-- 4 (inverso) · drop de los 3 CHECK nuevos de cantidad, restaurar los 2 viejos.
ALTER TABLE "items_compra" DROP CONSTRAINT "items_compra_cantidad_entregada_check";
ALTER TABLE "items_compra" DROP CONSTRAINT "items_compra_cantidad_recibida_check";
ALTER TABLE "items_compra" DROP CONSTRAINT "items_compra_cantidad_ordenada_check";

-- 3 (inverso) · RENAME de vuelta.
ALTER TABLE "items_compra" RENAME COLUMN "cantidad_recibida" TO "cantidad_comprada";
ALTER TABLE "items_compra" ADD CONSTRAINT "items_compra_cantidad_comprada_check" CHECK (
    "cantidad_comprada" >= 0 AND "cantidad_comprada" <= "cantidad"
);
ALTER TABLE "items_compra" ADD CONSTRAINT "items_compra_cantidad_entregada_check" CHECK (
    "cantidad_entregada" >= 0 AND "cantidad_entregada" <= "cantidad_comprada"
);

-- 1-2 (inverso) · drop de las columnas nuevas (pierde cantidad_ordenada y las 3 fechas).
ALTER TABLE "items_compra" DROP COLUMN "cantidad_ordenada";
ALTER TABLE "items_compra" DROP COLUMN "fecha_orden";
ALTER TABLE "items_compra" DROP COLUMN "fecha_recepcion";
ALTER TABLE "items_compra" DROP COLUMN "fecha_entrega";
