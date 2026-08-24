-- WU-1 (sdd/preventivo). Ref tasks WU1.9. Ref design ADR-PV6.
--
-- Backfill de PREVENTIVO:LECTURA/ALTAS/MODIFICACION/BORRADO para los usuarios
-- TECNICO que YA existían antes de que WU-1 sumara el módulo a `PRESETS_ROL`.
-- Los presets solo se aplican al crear un usuario o al reaplicar un rol
-- (`PATCH /usuarios/:id/rol` con `reaplicarPreset: true`) — sin este backfill
-- ningún TECNICO preexistente puede ver ni administrar el mantenimiento
-- preventivo, sin error visible: se lee como "el módulo no está".
--
-- SOLO TECNICO — a diferencia del backfill de CSAT, COLABORADOR NO lleva
-- este módulo (ver ADR-PV6: "USUARIO/COLABORADOR no llevan nada").
--
-- NO toca ADMINISTRADOR: matriz vacía por diseño, bypasea la grilla vía
-- `resolverScope` (R2 de sdd/matriz-permisos-por-usuario).
--
-- IDEMPOTENTE: la PK compuesta de `usuario_cliente_permisos`
-- (usuario_id, cliente_id, modulo, accion) hace que `ON CONFLICT DO NOTHING`
-- evite duplicados en una segunda corrida — no requiere un índice adicional.
--
-- Solo membresías ACTIVAS y no borradas, mismo filtro que
-- `20260824120000_backfill_csat_lectura_permiso`.
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
  AND r.codigo = 'TECNICO'
ON CONFLICT DO NOTHING;
