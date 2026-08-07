-- Migration: 20260806170000_add_permiso_kb_gestionar
-- PR-K — Fase 4 "Premium" (proyecto soporte), módulo KB
-- Ref spec: sdd/premium/spec K4 (permiso de gestión de KB, GATE G4)
-- Ref design: sdd/premium/design ADR-P6
--
-- Decisión de esta sesión (gate G4 confirmado por el dueño): agregar un
-- permiso EXPLÍCITO `kb:gestionar` para el CRUD de artículos de la base de
-- conocimiento (kb_articulos), asignado a TECNICO + ADMINISTRADOR — el
-- equipo de soporte (no solo ADMIN) redacta/mantiene la KB. Alternativa
-- rechazada: reusar `catalogo:gestionar` (ADMIN-only) — no cubre al
-- equipo TECNICO que es quien efectivamente escribe artículos.
--
-- Idempotencia (mismo patrón que 20260806120000_add_permiso_catalogo_gestionar):
--   permisos:        ON CONFLICT (codigo) DO NOTHING
--   roles_permisos:  ON CONFLICT (rol_id, permiso_id) DO NOTHING
--   La join se llena vía SELECT JOIN por codigo — no hardcodea el UUID del
--   rol (sobrevive a entornos donde el rol ya exista con un id distinto al
--   determinista de la migración base).
--
-- UUID determinista: siguiente en la serie b0000000-0000-4000-b000
-- (continúa desde …0020, catalogo:gestionar):
--
--   kb:gestionar → b0000000-0000-4000-b000-000000000021
--
-- Totales por rol tras esta migración: USUARIO=2, COLABORADOR=7,
-- TECNICO=15 (14 + kb:gestionar), ADMINISTRADOR=21 (20 + kb:gestionar).

-- ─── PERMISO NUEVO ─────────────────────────────────────────────────────────

INSERT INTO permisos (id, codigo, descripcion, updated_at) VALUES
  ('b0000000-0000-4000-b000-000000000021', 'kb:gestionar',
    'CRUD de artículos de la base de conocimiento (kb_articulos): crear, editar, publicar/despublicar, eliminar (soft delete)', CURRENT_TIMESTAMP)
ON CONFLICT (codigo) DO NOTHING;

-- ─── ROLES_PERMISOS — TECNICO + ADMINISTRADOR (SELECT JOIN por codigo) ────

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permisos p
WHERE r.codigo IN ('TECNICO', 'ADMINISTRADOR')
  AND p.codigo = 'kb:gestionar'
ON CONFLICT (rol_id, permiso_id) DO NOTHING;
