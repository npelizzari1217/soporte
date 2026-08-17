-- Editar cabecera de compra: agrega el tipo de bitácora COMPRA_EDITADA
-- (vigente, WU editar-compra) al CHECK operaciones_compra_tipo_check.
-- Catálogo append-only (ADR-C4): pasa de 12 valores (11 vigentes + 1 legacy)
-- a 13 (12 vigentes + 1 legacy COMPRA_REGISTRADA).

ALTER TABLE "operaciones_compra" DROP CONSTRAINT "operaciones_compra_tipo_check";
ALTER TABLE "operaciones_compra" ADD CONSTRAINT "operaciones_compra_tipo_check" CHECK ("tipo" IN (
    'CREACION',
    'COMPRA_EDITADA',
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
