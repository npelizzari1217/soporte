-- Migration: 20260701010000_seed_rbac_configuracion_gestionar
-- Change: runtime-config-table — PR1 (fundaciones)
-- Ref design: §9, F4. Ref spec: R4 (seed idempotente). Tarea: 1.3
--
-- Siembra el permiso nuevo `configuracion:gestionar` y lo asigna al rol admin.
--
-- UUID determinista (F4 — próximo libre confirmado): el último permiso
-- sembrado es b0000000-...-019 (ticket:comentar, migración
-- 20260629100000_seed_rbac_4_roles) ⇒ el siguiente libre es ...020.
--
-- DESVIACIÓN DOCUMENTADA respecto a la letra de tasks.md/design.md (que dicen
-- "asignación rol ADMIN"): el rol con codigo='ADMIN' fue SOFT-DELETED por la
-- migración 20260629110000_remap_usuarios_roles (change tickets-rbac-4-roles,
-- posterior a la redacción de este design) — todos los usuarios fueron
-- remapeados al rol 'ADMINISTRADOR' (a0000000-...-009). Asignar el permiso
-- nuevo al codigo legacy 'ADMIN' insertaría una fila roles_permisos
-- "viva" pero INÚTIL (ningún usuario activo tiene ese rol). Se usa
-- 'ADMINISTRADOR' — el rol admin REALMENTE activo — para que el permiso
-- surta efecto. Ver STATE.md §Apply Progress — PR1 para más detalle.
--
-- Idempotencia:
--   permisos:        ON CONFLICT (codigo) DO NOTHING
--   roles_permisos:  ON CONFLICT (rol_id, permiso_id) DO NOTHING
--   La join se llena via SELECT JOIN por codigo — no hardcodea UUIDs de roles.

-- ─── PERMISO nuevo ────────────────────────────────────────────────────────────

INSERT INTO permisos (id, codigo, descripcion) VALUES
  ('b0000000-0000-4000-b000-000000000020', 'configuracion:gestionar',
    'Leer y editar la configuración operativa en runtime (SMTP, etc.)')
ON CONFLICT (codigo) DO NOTHING;

-- ─── ROLES_PERMISOS — asignado al rol admin REALMENTE activo (ADMINISTRADOR) ──

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE r.codigo = 'ADMINISTRADOR' AND p.codigo = 'configuracion:gestionar'
ON CONFLICT (rol_id, permiso_id) DO NOTHING;
