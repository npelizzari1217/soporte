-- Migration: 20260806120000_add_permiso_catalogo_gestionar
-- PR2 — Fase 2 "Tickets Core" (proyecto soporte)
-- Ref spec: sdd/tickets-core/spec T2 (CRUD de catálogos tipos_ticket/prioridades)
-- Ref design: sdd/tickets-core/design ADR-2 (gap `catalogo:gestionar`)
--
-- Decisión de esta sesión: agregar un permiso EXPLÍCITO `catalogo:gestionar`
-- para el CRUD de catálogos (tipos_ticket, prioridades), en vez de reusar
-- `cliente:gestionar` como proponía ADR-2 como alternativa. Asignado
-- EXCLUSIVAMENTE al rol ADMINISTRADOR — el catálogo de permisos deja de ser
-- "19 fijos, sin ampliar salvo catálogos" (ADR-2) y pasa a 20.
--
-- Idempotencia (mismo patrón que 20260805110000_seed_rbac_4_roles_permisos):
--   permisos:        ON CONFLICT (codigo) DO NOTHING
--   roles_permisos:  ON CONFLICT (rol_id, permiso_id) DO NOTHING
--   La join se llena vía SELECT JOIN por codigo — no hardcodea el UUID del
--   rol ADMINISTRADOR (sobrevive a entornos donde el rol ya exista con un id
--   distinto al determinista de la migración base).
--
-- UUID determinista: siguiente en la serie b0000000-0000-4000-b000
-- (continúa desde …0019, el último permiso sembrado en la migración base):
--
--   catalogo:gestionar → b0000000-0000-4000-b000-000000000020
--
-- Totales por rol tras esta migración: USUARIO=2, COLABORADOR=7, TECNICO=14,
-- ADMINISTRADOR=20 (19 + catalogo:gestionar).

-- ─── PERMISO NUEVO ─────────────────────────────────────────────────────────

INSERT INTO permisos (id, codigo, descripcion, updated_at) VALUES
  ('b0000000-0000-4000-b000-000000000020', 'catalogo:gestionar',
    'CRUD de catálogos de tickets (tipos_ticket, prioridades) — estados es FIJO y NO editable ni con este permiso', CURRENT_TIMESTAMP)
ON CONFLICT (codigo) DO NOTHING;

-- ─── ROLES_PERMISOS — solo ADMINISTRADOR (SELECT JOIN por codigo) ─────────

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permisos p
WHERE r.codigo = 'ADMINISTRADOR'
  AND p.codigo = 'catalogo:gestionar'
ON CONFLICT (rol_id, permiso_id) DO NOTHING;
