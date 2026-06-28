-- Migration: 20260627000000_seed_rbac_ticket_editar_eliminar
-- Change: tickets-editar-borrar — S1-T2
-- Ref spec: [SPEC:auth-rbac/Permisos sembrados, UUID determinista, Rol ADMIN, Rol SOPORTE_IT]
--
-- Siembra 2 permisos nuevos y sus asignaciones a roles.
-- Idempotente: ON CONFLICT (codigo) DO NOTHING / ON CONFLICT (rol_id, permiso_id) DO NOTHING.
-- La join roles_permisos se llena via SELECT JOIN por codigo (no hardcodea UUIDs de roles).
--
-- Permisos nuevos:
--   ticket:editar   → b0000000-0000-4000-b000-000000000012  (siguiente libre tras ...011)
--   ticket:eliminar → b0000000-0000-4000-b000-000000000013
--
-- Asignaciones:
--   ticket:editar   → ADMIN, SOPORTE_IT
--   ticket:eliminar → ADMIN (exclusivo — menor privilegio)

-- ─── PERMISOS nuevos ──────────────────────────────────────────────────────────

INSERT INTO permisos (id, codigo, descripcion) VALUES
  ('b0000000-0000-4000-b000-000000000012', 'ticket:editar',   'Editar campos de datos de un ticket'),
  ('b0000000-0000-4000-b000-000000000013', 'ticket:eliminar', 'Dar de baja (soft-delete) un ticket')
ON CONFLICT (codigo) DO NOTHING;

-- ─── ROLES_PERMISOS — via SELECT JOIN por codigo ──────────────────────────────
-- No hardcodea UUIDs de roles: funciona aunque los roles ya existieran con IDs distintos.
-- Mismo patrón que 20260623010000_seed_rbac_base.

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permisos p
WHERE (r.codigo = 'ADMIN'      AND p.codigo IN ('ticket:editar', 'ticket:eliminar'))
   OR (r.codigo = 'SOPORTE_IT' AND p.codigo IN ('ticket:editar'))
ON CONFLICT (rol_id, permiso_id) DO NOTHING;
