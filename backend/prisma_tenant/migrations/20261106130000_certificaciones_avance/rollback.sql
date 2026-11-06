-- Rollback de 20261106130000_certificaciones_avance. Se puede correr dos veces.
-- Correrlo con los servicios detenidos y revertir el codigo antes de levantarlos. BORRA los
-- certificados emitidos y su historial: hacer un dump antes si hay que poder restaurarlos.
DELETE FROM "operaciones_ticket"
 WHERE "tipo_operacion_id" IN (
   SELECT "id" FROM "tipo_operacion" WHERE "codigo" IN ('CERTIFICADO_EMITIDO', 'CERTIFICADO_ANULADO')
 );
DELETE FROM "tipo_operacion" WHERE "codigo" IN ('CERTIFICADO_EMITIDO', 'CERTIFICADO_ANULADO');
DROP TABLE IF EXISTS "certificacion_tarea";
DROP TABLE IF EXISTS "certificaciones_avance";
