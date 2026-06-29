-- Migration: 20260629040000_seed_rbac_ticket_estados
-- Change: tickets-maquina-estados-observaciones — PR3 / Task P3.T12
-- Ref design: ADR-5
--
-- Siembra 4 permisos granulares para las transiciones de estado y observaciones.
-- Idempotente: ON CONFLICT (codigo) DO NOTHING / ON CONFLICT (rol_id, permiso_id) DO NOTHING.
--
-- UUIDs CONTRACT: los códigos b0..014-017 están fijados para coincidir con Change B
-- (tickets-rbac-4-roles) que los redistribuye a otros roles. NO modificar.
--
-- Permisos nuevos:
--   ticket:observar     → b0000000-0000-4000-b000-000000000014
--   ticket:transicionar → b0000000-0000-4000-b000-000000000015
--   ticket:aprobar      → b0000000-0000-4000-b000-000000000016
--   ticket:rechazar     → b0000000-0000-4000-b000-000000000017
--
-- Asignaciones (ADR-5):
--   ticket:observar     → ADMIN, SOPORTE_IT, MANTENIMIENTO, SOLICITANTE
--   ticket:transicionar → ADMIN, SOPORTE_IT, MANTENIMIENTO
--   ticket:aprobar      → ADMIN, APROBADOR_COMPRAS
--   ticket:rechazar     → ADMIN, APROBADOR_COMPRAS

-- ─── PERMISOS nuevos ──────────────────────────────────────────────────────────

INSERT INTO permisos (id, codigo, descripcion) VALUES
  ('b0000000-0000-4000-b000-000000000014', 'ticket:observar',     'Registrar una observación técnica en un ticket'),
  ('b0000000-0000-4000-b000-000000000015', 'ticket:transicionar', 'Realizar transiciones técnicas de estado de un ticket'),
  ('b0000000-0000-4000-b000-000000000016', 'ticket:aprobar',      'Aprobar un ticket (arco ABIERTO → APROBADO)'),
  ('b0000000-0000-4000-b000-000000000017', 'ticket:rechazar',     'Rechazar un ticket (arco ABIERTO → RECHAZADO)')
ON CONFLICT (codigo) DO NOTHING;

-- ─── ROLES_PERMISOS — via SELECT JOIN por codigo ──────────────────────────────
-- No hardcodea UUIDs de roles: funciona aunque los roles ya existieran con IDs distintos.
-- Mismo patrón que migraciones anteriores.

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permisos p
WHERE (r.codigo = 'ADMIN'             AND p.codigo IN ('ticket:observar', 'ticket:transicionar', 'ticket:aprobar', 'ticket:rechazar'))
   OR (r.codigo = 'SOPORTE_IT'        AND p.codigo IN ('ticket:observar', 'ticket:transicionar'))
   OR (r.codigo = 'MANTENIMIENTO'     AND p.codigo IN ('ticket:observar', 'ticket:transicionar'))
   OR (r.codigo = 'APROBADOR_COMPRAS' AND p.codigo IN ('ticket:aprobar', 'ticket:rechazar'))
   OR (r.codigo = 'SOLICITANTE'       AND p.codigo IN ('ticket:observar'))
ON CONFLICT (rol_id, permiso_id) DO NOTHING;
