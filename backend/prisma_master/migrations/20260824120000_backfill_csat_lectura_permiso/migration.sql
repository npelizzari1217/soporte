-- WU-10.1 (sdd/csat). Ref tasks WU10.1, hueco abierto #2484 punto 1.
--
-- Backfill de CSAT:LECTURA para los usuarios TECNICO y COLABORADOR que YA
-- existían antes de que WU-3 (sdd/csat) sumara el permiso a `PRESETS_ROL`.
-- Los presets solo se aplican al crear un usuario o al reaplicar un rol
-- (`PATCH /usuarios/:id/rol` con `reaplicarPreset: true`) — sin este backfill
-- ningún usuario preexistente puede ver los resultados del CSAT aunque el
-- cliente encienda `csat_habilitado`, y sin error visible (el gateo es por
-- ausencia de campo en el payload, ADR-C5): se lee como "la feature no anda".
--
-- NO toca ADMINISTRADOR: matriz vacía por diseño, bypasea la grilla vía
-- `resolverScope` (R2 de sdd/matriz-permisos-por-usuario). NO toca USUARIO:
-- el preset de ese rol no incluye CSAT:LECTURA (no ve Dashboard).
--
-- IDEMPOTENTE: la PK compuesta de `usuario_cliente_permisos`
-- (usuario_id, cliente_id, modulo, accion) hace que `ON CONFLICT DO NOTHING`
-- evite duplicados en una segunda corrida — no requiere un índice adicional.
--
-- Solo membresías ACTIVAS y no borradas, mismo filtro que el backfill
-- histórico `20260816220000_backfill_matriz_permisos`. `roles`/`membresias`
-- siguen vivas tras el DROP de `20260817180000` (solo se retiraron
-- `roles_permisos`/`permisos`/`usuario_cliente_modulos`).
INSERT INTO usuario_cliente_permisos (usuario_id, cliente_id, modulo, accion)
SELECT DISTINCT m.usuario_id, m.cliente_id, 'CSAT', 'LECTURA'
FROM membresias m
JOIN roles r ON r.id = m.rol_id
WHERE m.activo = true
  AND m.deleted_at IS NULL
  AND r.codigo IN ('TECNICO', 'COLABORADOR')
ON CONFLICT DO NOTHING;
