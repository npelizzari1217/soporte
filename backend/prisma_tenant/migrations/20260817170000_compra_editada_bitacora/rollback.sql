-- Rollback de 20260817170000_compra_editada_bitacora: inverso EXACTO —
-- vuelve al catálogo de 12 valores (11 vigentes + 1 legacy), sin
-- COMPRA_EDITADA. Solo seguro si ninguna fila real llegó a escribir
-- COMPRA_EDITADA (append-only: reinterpretar/borrar esas filas no es una
-- opción; verificar `SELECT count(*) FROM operaciones_compra WHERE tipo =
-- 'COMPRA_EDITADA'` ANTES de correr esto).

ALTER TABLE "operaciones_compra" DROP CONSTRAINT "operaciones_compra_tipo_check";
ALTER TABLE "operaciones_compra" ADD CONSTRAINT "operaciones_compra_tipo_check" CHECK ("tipo" IN (
    'CREACION',
    'ITEM_AGREGADO',
    'ITEM_EDITADO',
    'ITEM_ELIMINADO',
    'ITEM_APROBADO',
    'ITEM_RECHAZADO',
    'ORDEN_REGISTRADA',
    'RECEPCION_REGISTRADA',
    'ENTREGA_REGISTRADA',
    'ITEM_CERRADO_CON_FALTANTE',
    'CANCELACION',
    'COMPRA_REGISTRADA'
));
