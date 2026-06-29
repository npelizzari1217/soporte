-- Migration: 20260629110000_remap_usuarios_roles
-- Change: tickets-rbac-4-roles — PR2 / Tasks T2.9–T2.11
-- Ref design: ADR-3
--
-- Remapea usuarios_roles de los 5 roles legacy a los 4 roles nuevos:
--   ADMIN           → ADMINISTRADOR  (a0..009)
--   SOLICITANTE     → USUARIO        (a0..006)
--   SOPORTE_IT      → TECNICO        (a0..008)
--   MANTENIMIENTO   → TECNICO        (a0..008)  ← ON CONFLICT DO NOTHING colapsa doble-rol
--   APROBADOR_COMPRAS → COLABORADOR  (a0..007)
--
-- Luego elimina las filas legacy y soft-deletes los 5 roles.
--
-- ORDEN OBLIGATORIO:
--   1. INSERT nuevas asignaciones  (usuarios nunca quedan sin rol)
--   2. DELETE filas legacy
--   3. Soft-delete roles legacy
--
-- Idempotencia:
--   INSERT: ON CONFLICT (usuario_id, rol_id) DO NOTHING
--   DELETE: idempotente (DELETE de 0 filas en 2ª ejecución → no-op)
--   UPDATE: AND deleted_at IS NULL → no sobreescribe el timestamp en 2ª ejecución

-- ─── T2.9: INSERT nuevas asignaciones (remap) ────────────────────────────────
-- Cada INSERT-SELECT lee las filas actuales de usuarios_roles donde rol_id = legacy,
-- y las inserta apuntando al nuevo rol. ON CONFLICT DO NOTHING maneja:
--   (a) idempotencia (2ª ejecución — la fila ya existe)
--   (b) colapso SOPORTE_IT + MANTENIMIENTO → un solo TECNICO

-- ADMIN → ADMINISTRADOR
INSERT INTO usuarios_roles (usuario_id, rol_id)
SELECT ur.usuario_id, r_new.id
FROM usuarios_roles ur
JOIN roles r_old ON r_old.id = ur.rol_id AND r_old.codigo = 'ADMIN'
JOIN roles r_new ON r_new.codigo = 'ADMINISTRADOR'
ON CONFLICT (usuario_id, rol_id) DO NOTHING;

-- SOLICITANTE → USUARIO
INSERT INTO usuarios_roles (usuario_id, rol_id)
SELECT ur.usuario_id, r_new.id
FROM usuarios_roles ur
JOIN roles r_old ON r_old.id = ur.rol_id AND r_old.codigo = 'SOLICITANTE'
JOIN roles r_new ON r_new.codigo = 'USUARIO'
ON CONFLICT (usuario_id, rol_id) DO NOTHING;

-- SOPORTE_IT → TECNICO
INSERT INTO usuarios_roles (usuario_id, rol_id)
SELECT ur.usuario_id, r_new.id
FROM usuarios_roles ur
JOIN roles r_old ON r_old.id = ur.rol_id AND r_old.codigo = 'SOPORTE_IT'
JOIN roles r_new ON r_new.codigo = 'TECNICO'
ON CONFLICT (usuario_id, rol_id) DO NOTHING;

-- MANTENIMIENTO → TECNICO (ON CONFLICT DO NOTHING colapsa usuario con ambos roles)
INSERT INTO usuarios_roles (usuario_id, rol_id)
SELECT ur.usuario_id, r_new.id
FROM usuarios_roles ur
JOIN roles r_old ON r_old.id = ur.rol_id AND r_old.codigo = 'MANTENIMIENTO'
JOIN roles r_new ON r_new.codigo = 'TECNICO'
ON CONFLICT (usuario_id, rol_id) DO NOTHING;

-- APROBADOR_COMPRAS → COLABORADOR
INSERT INTO usuarios_roles (usuario_id, rol_id)
SELECT ur.usuario_id, r_new.id
FROM usuarios_roles ur
JOIN roles r_old ON r_old.id = ur.rol_id AND r_old.codigo = 'APROBADOR_COMPRAS'
JOIN roles r_new ON r_new.codigo = 'COLABORADOR'
ON CONFLICT (usuario_id, rol_id) DO NOTHING;

-- ─── T2.10: DELETE filas legacy de usuarios_roles ────────────────────────────
-- Elimina TODAS las filas donde rol_id apunta a uno de los 5 roles legacy.
-- Idempotente: DELETE de 0 filas en 2ª ejecución (ya eliminadas).

DELETE FROM usuarios_roles
WHERE rol_id IN (
  SELECT id FROM roles
  WHERE codigo IN ('ADMIN', 'SOPORTE_IT', 'MANTENIMIENTO', 'APROBADOR_COMPRAS', 'SOLICITANTE')
);

-- ─── T2.11: Soft-delete de roles legacy ──────────────────────────────────────
-- AND deleted_at IS NULL: guard idempotente — no sobreescribe el timestamp en 2ª ejecución.

UPDATE roles
SET deleted_at = now()
WHERE codigo IN ('ADMIN', 'SOPORTE_IT', 'MANTENIMIENTO', 'APROBADOR_COMPRAS', 'SOLICITANTE')
  AND deleted_at IS NULL;
