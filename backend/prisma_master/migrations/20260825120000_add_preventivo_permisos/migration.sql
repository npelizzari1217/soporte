-- WU-1 (sdd/preventivo). Ref spec "Permiso propio del módulo PREVENTIVO". Ref design ADR-PV6.
--
-- Suma el módulo PREVENTIVO (LECTURA, ALTAS, MODIFICACION, BORRADO) al catálogo
-- de la matriz de permisos. El CHECK compuesto de `usuario_cliente_permisos` no
-- admite ALTER incremental (es un `= ANY (ARRAY[...])` estático), así que se
-- hace DROP + ADD con el array completo — mismo patrón que
-- `20260823120200_add_csat_lectura_permiso`. Pasa de 29 a 33 pares.
--
-- Estructura pura: la tabla queda vacía de celdas PREVENTIVO hasta que se
-- apliquen presets o se edite la matriz a mano. Cero efecto de runtime.
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
      'PREVENTIVO:LECTURA', 'PREVENTIVO:ALTAS', 'PREVENTIVO:MODIFICACION', 'PREVENTIVO:BORRADO'
    ]));
