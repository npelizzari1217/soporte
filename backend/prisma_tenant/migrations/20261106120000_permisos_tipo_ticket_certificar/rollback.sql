-- Rollback de 20261106120000_permisos_tipo_ticket_certificar. Se puede correr dos veces.
-- Antes de correrlo, revertir el codigo. BORRA los permisos CERTIFICAR concedidos: el CHECK
-- anterior no los admite. Hacer un dump antes si hay que poder restaurarlos.
DELETE FROM "permisos_tipo_ticket" WHERE "accion" = 'CERTIFICAR';
ALTER TABLE "permisos_tipo_ticket" DROP CONSTRAINT IF EXISTS "permisos_tipo_ticket_accion_check";
ALTER TABLE "permisos_tipo_ticket" ADD CONSTRAINT "permisos_tipo_ticket_accion_check" CHECK ("accion" IN (
    'LECTURA', 'VER_TODOS', 'ALTAS', 'MODIFICACION', 'TRANSICIONAR',
    'ASIGNAR', 'COMENTAR', 'OBSERVAR', 'IMPRESION', 'BORRADO'
));
