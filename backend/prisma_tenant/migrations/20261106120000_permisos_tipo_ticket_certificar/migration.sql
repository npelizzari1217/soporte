-- odd/edilicia-obra-externa T3a: accion CERTIFICAR por tipo de ticket (S6, L23).
-- Certificar el avance de una obra externa exige un permiso propio. Ninguna plantilla de rol lo
-- concede: ADMINISTRADOR y ROOT no tienen restriccion por tipo, y a cualquier otro usuario se lo
-- concede un administrador desde Permisos. Solo se reescribe el CHECK; no se insertan filas.
-- El CHECK se compara contra ACCIONES_TIPO_TICKET en prisma-permiso-tipo-ticket.repository.integration.spec.ts.
ALTER TABLE "permisos_tipo_ticket" DROP CONSTRAINT "permisos_tipo_ticket_accion_check";
ALTER TABLE "permisos_tipo_ticket" ADD CONSTRAINT "permisos_tipo_ticket_accion_check" CHECK ("accion" IN (
    'LECTURA', 'VER_TODOS', 'ALTAS', 'MODIFICACION', 'TRANSICIONAR',
    'ASIGNAR', 'COMENTAR', 'OBSERVAR', 'IMPRESION', 'BORRADO', 'CERTIFICAR'
));
