-- Unidad 1 de insumos-entrega-2. Ref design:
-- openspec/changes/insumos-entrega-2/design.md, decisión 2.
--
-- Suma el módulo INSUMOS (LECTURA, ALTAS, AJUSTAR) al catálogo de la matriz de
-- permisos. El CHECK compuesto de `usuario_cliente_permisos` no admite ALTER
-- incremental (es un `= ANY (ARRAY[...])` estático), así que se hace DROP + ADD
-- con el array completo — mismo patrón que
-- `20260825120000_add_preventivo_permisos`. Pasa de 33 a 36 pares.
--
-- `AJUSTAR` es acción propia del módulo, no del piso: separa quién firma un
-- AJUSTE —la operación que puede tapar un faltante— de quién registra una
-- ENTRADA o una SALIDA. No reusa `APROBACION` porque no hay un registro
-- pendiente que un segundo actor apruebe después.
--
-- Sin `MODIFICACION` ni `BORRADO`: `movimientos_insumo` es append-only, un
-- movimiento se corrige con otro movimiento.
--
-- Estructura pura: la tabla queda vacía de celdas INSUMOS hasta que un
-- ADMINISTRADOR edite la matriz. Sin backfill y sin cambio de presets — los
-- permisos se otorgan por usuario. Cero efecto de runtime.
ALTER TABLE "usuario_cliente_permisos"
  DROP CONSTRAINT "usuario_cliente_permisos_modulo_accion_check";

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
