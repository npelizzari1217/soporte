-- WU-3 (sdd/csat). Ref spec "Permiso y visibilidad por rol". Ref design ADR-C4.
--
-- Suma el módulo CSAT (solo LECTURA) al catálogo de la matriz de permisos.
-- El CHECK compuesto de `usuario_cliente_permisos` no admite ALTER incremental
-- (es un `= ANY (ARRAY[...])` estático), así que se hace DROP + ADD con el
-- array completo — mismo patrón que la creación original en
-- `20260816210000_add_usuario_cliente_permisos`. Pasa de 28 a 29 pares.
--
-- Estructura pura: la tabla queda vacía de celdas CSAT hasta que se apliquen
-- presets o se edite la matriz a mano. Cero efecto de runtime.
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
      'CSAT:LECTURA'
    ]));
