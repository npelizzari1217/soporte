-- T9b (odd/tasks/permisos-por-tipo-ticket.md, L50.1-2).
--
-- Retira de la matriz de permisos las celdas que pasaron a los permisos por tipo
-- de ticket (`permisos_tipo_ticket`, en cada tenant): el módulo TICKETS entero y
-- EDILICIA:LECTURA, ALTAS y MODIFICACION. EDILICIA conserva solo BORRADO, que
-- habilita desvincular una compra de una reparación (L21). Pasa de 36 a 25 pares.
--
-- Esas celdas no deciden nada desde la etapa 1 (D5 d): el acceso a tickets lo da
-- la tabla por tipo. Borrarlas no cambia el acceso de nadie.
--
-- DESTRUCTIVO para esas filas: el rollback restaura el CHECK pero no las celdas.
-- Si hiciera falta recuperarlas, salen del dump previo al deploy
-- (`predeploy-dump.ps1`, ver `rollback.sql`).
--
-- Orden: primero el DELETE, porque el CHECK nuevo valida las filas existentes al
-- crearse. Re-ejecutable: el DELETE borra cero filas en una segunda corrida y el
-- DROP usa `IF EXISTS`. El CHECK no admite ALTER incremental (es un
-- `= ANY (ARRAY[...])` estático), así que se hace DROP + ADD con el array completo,
-- mismo patrón que `20260906120000_add_insumos_permisos`.
DELETE FROM "usuario_cliente_permisos"
WHERE "modulo" = 'TICKETS'
   OR ("modulo" = 'EDILICIA' AND "accion" IN ('LECTURA', 'ALTAS', 'MODIFICACION'));

ALTER TABLE "usuario_cliente_permisos"
  DROP CONSTRAINT IF EXISTS "usuario_cliente_permisos_modulo_accion_check";

ALTER TABLE "usuario_cliente_permisos"
  ADD CONSTRAINT "usuario_cliente_permisos_modulo_accion_check"
    CHECK (("modulo" || ':' || "accion") = ANY (ARRAY[
      'COMPRAS:LECTURA', 'COMPRAS:ALTAS', 'COMPRAS:MODIFICACION', 'COMPRAS:BORRADO', 'COMPRAS:APROBACION',
      'EDILICIA:BORRADO',
      'EQUIPOS:LECTURA', 'EQUIPOS:ALTAS', 'EQUIPOS:MODIFICACION', 'EQUIPOS:BORRADO',
      'KB:LECTURA', 'KB:ALTAS', 'KB:MODIFICACION', 'KB:BORRADO', 'KB:VER_TODOS', 'KB:PUBLICAR',
      'DASHBOARD:LECTURA',
      'CSAT:LECTURA',
      'PREVENTIVO:LECTURA', 'PREVENTIVO:ALTAS', 'PREVENTIVO:MODIFICACION', 'PREVENTIVO:BORRADO',
      'INSUMOS:LECTURA', 'INSUMOS:ALTAS', 'INSUMOS:AJUSTAR'
    ]));
