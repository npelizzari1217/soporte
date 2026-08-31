-- WU-1 (preventivo-edicion-y-permisos). Ref tasks WU-1.4. Ref design:
-- openspec/changes/preventivo-edicion-y-permisos/design.md (ADR-3).
--
-- Swap de permisos PREVENTIVO:* de TECNICO a COLABORADOR: DELETE de las
-- celdas modulo='PREVENTIVO' de las membresias TECNICO (sin filtrar activo),
-- seguido de INSERT ... SELECT de los cuatro pares para las membresias
-- COLABORADOR activas y no borradas, ON CONFLICT DO NOTHING.
--
-- Orden deliberado (ADR-3): el DELETE va antes que el INSERT, para que un
-- usuario con membresías de los dos roles en el mismo cliente termine con
-- la concesión y no con la revocación.
--
-- El DELETE NO filtra `activo`: revocar es total, porque una celda que
-- sobrevive en una membresía TECNICO inactiva devuelve el módulo el día
-- que esa membresía se reactive. El INSERT sí filtra
-- `activo = true AND deleted_at IS NULL` (simetría con la migración
-- `20260825120100`): otorgar es conservador.
--
-- ADMINISTRADOR no aparece en ninguna de las dos sentencias — matriz vacía
-- por diseño, bypasea vía `resolverScope`.
--
-- IDEMPOTENTE: la PK compuesta de `usuario_cliente_permisos`
-- (usuario_id, cliente_id, modulo, accion) hace que `ON CONFLICT DO NOTHING`
-- evite duplicados en el INSERT; el DELETE borra cero filas en una segunda
-- corrida.
DELETE FROM usuario_cliente_permisos ucp
USING membresias m
JOIN roles r ON r.id = m.rol_id
WHERE ucp.usuario_id = m.usuario_id
  AND ucp.cliente_id = m.cliente_id
  AND ucp.modulo = 'PREVENTIVO'
  AND r.codigo = 'TECNICO';

INSERT INTO usuario_cliente_permisos (usuario_id, cliente_id, modulo, accion)
SELECT DISTINCT m.usuario_id, m.cliente_id, modulo_accion.modulo, modulo_accion.accion
FROM membresias m
JOIN roles r ON r.id = m.rol_id
CROSS JOIN (VALUES
  ('PREVENTIVO', 'LECTURA'),
  ('PREVENTIVO', 'ALTAS'),
  ('PREVENTIVO', 'MODIFICACION'),
  ('PREVENTIVO', 'BORRADO')
) AS modulo_accion(modulo, accion)
WHERE m.activo = true
  AND m.deleted_at IS NULL
  AND r.codigo = 'COLABORADOR'
ON CONFLICT DO NOTHING;
