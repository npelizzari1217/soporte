-- Rollback de 20261023120000_retirar_celdas_tickets_matriz.
--
-- Restaura el CHECK de 36 pares anterior a T9b (el de
-- `20260906120000_add_insumos_permisos`). NO restaura las celdas borradas: el
-- DELETE de la migración no se puede deshacer por SQL. Si hacen falta, se
-- recuperan de `usuario_cliente_permisos` en el dump previo al deploy
-- (`predeploy-dump.ps1`).
--
-- El código anterior a T9b funciona sin esas celdas: desde la etapa 1 el acceso
-- a tickets sale de `permisos_tipo_ticket`. Re-ejecutable: `IF EXISTS`.
ALTER TABLE "usuario_cliente_permisos"
  DROP CONSTRAINT IF EXISTS "usuario_cliente_permisos_modulo_accion_check";

ALTER TABLE "usuario_cliente_permisos"
  ADD CONSTRAINT "usuario_cliente_permisos_modulo_accion_check"
    CHECK (("modulo" || ':' || "accion") = ANY (ARRAY[
      'TICKETS:LECTURA', 'TICKETS:ALTAS', 'TICKETS:MODIFICACION', 'TICKETS:VER_TODOS',
      'TICKETS:ASIGNAR', 'TICKETS:TRANSICIONAR', 'TICKETS:OBSERVAR', 'TICKETS:COMENTAR',
      'COMPRAS:LECTURA', 'COMPRAS:ALTAS', 'COMPRAS:MODIFICACION', 'COMPRAS:BORRADO', 'COMPRAS:APROBACION',
      'EDILICIA:LECTURA', 'EDILICIA:ALTAS', 'EDILICIA:MODIFICACION', 'EDILICIA:BORRADO',
      'EQUIPOS:LECTURA', 'EQUIPOS:ALTAS', 'EQUIPOS:MODIFICACION', 'EQUIPOS:BORRADO',
      'KB:LECTURA', 'KB:ALTAS', 'KB:MODIFICACION', 'KB:BORRADO', 'KB:VER_TODOS', 'KB:PUBLICAR',
      'DASHBOARD:LECTURA',
      'CSAT:LECTURA',
      'PREVENTIVO:LECTURA', 'PREVENTIVO:ALTAS', 'PREVENTIVO:MODIFICACION', 'PREVENTIVO:BORRADO',
      'INSUMOS:LECTURA', 'INSUMOS:ALTAS', 'INSUMOS:AJUSTAR'
    ]));
