-- Migration: 20260623010000_seed_rbac_base
-- PR-07: Datos maestros de RBAC — idempotente (ON CONFLICT DO NOTHING)
-- Tarea: 2.E.1
-- Ref spec: [SPEC:auth-rbac/Seeds iniciales en migración master]
--
-- Roles sembrados: ADMIN, SOPORTE_IT, MANTENIMIENTO, APROBADOR_COMPRAS, SOLICITANTE
-- Permisos sembrados: 11 permisos atómicos (convención recurso:accion)
-- Idempotencia:
--   - roles/permisos: ON CONFLICT (codigo) DO NOTHING
--   - roles_permisos: ON CONFLICT (rol_id, permiso_id) DO NOTHING
--   - La join table se llena via SELECT JOIN by codigo → no hardcodea UUIDs en el join.
--
-- Decisión de UUIDs:
--   Roles y permisos usan UUIDs FIJOS y DETERMINISTAS (prefijos a0000000 y b0000000).
--   Razón: estabilidad cross-environment — los mismos IDs en dev, test y prod para
--   datos de catálogo master. Permite referenciar UUIDs en código de seeds futuros
--   sin necesidad de lookups previos.
--   Los UUIDs de roles_permisos NO se hardcodean: la join se rellena por codigo
--   para sobrevivir a entornos donde los roles/permisos ya existan con IDs distintos.
--
-- Mapeo base roles → permisos:
--   ADMIN          → TODOS los 11 permisos
--                    [SPEC-EXPLICIT: "ADMIN tiene todos los permisos"]
--   SOPORTE_IT     → ticket:crear, ticket:asignar, ticket:cerrar, ticket:ver_todos, equipo:gestionar
--                    [SPEC-EXPLICIT: ticket:crear + ticket:ver_todos (scenario de unión de permisos)]
--                    [INFERRED: ticket:asignar, ticket:cerrar, equipo:gestionar por dominio del rol]
--   MANTENIMIENTO  → ticket:crear, ticket:ver_todos, subtarea:actualizar
--                    [INFERRED: gestiona subtareas edilicias; ver task 5.D.1 — guard subtarea:actualizar]
--   APROBADOR_COMPRAS → ticket:crear, ticket:ver_todos, compra:aprobar, compra:gestionar
--                    [SPEC-EXPLICIT: ticket:crear + compra:aprobar (scenario de unión de permisos)]
--                    [INFERRED: ticket:ver_todos (necesita ver todos), compra:gestionar (gestión presupuestos)]
--   SOLICITANTE    → ticket:crear
--                    [INFERRED: rol más básico — solo puede crear tickets]

-- ─── ROLES (5 roles base del sistema) ────────────────────────────────────────
-- id: UUID fijo determinista (prefijo a0000000-0000-4000-a000) para estabilidad cross-env.
-- created_at / updated_at: omitidos (DEFAULT CURRENT_TIMESTAMP en la tabla).

INSERT INTO roles (id, codigo, nombre, descripcion) VALUES
  ('a0000000-0000-4000-a000-000000000001', 'ADMIN',             'Administrador',        'Acceso total al sistema — gestión de usuarios, roles, clientes y todos los flujos de tickets'),
  ('a0000000-0000-4000-a000-000000000002', 'SOPORTE_IT',        'Soporte IT',           'Gestión de tickets de soporte y equipos informáticos'),
  ('a0000000-0000-4000-a000-000000000003', 'MANTENIMIENTO',     'Mantenimiento',        'Gestión de tickets edilicios y subtareas de reparación'),
  ('a0000000-0000-4000-a000-000000000004', 'APROBADOR_COMPRAS', 'Aprobador de Compras', 'Aprobación y gestión de tickets de compras'),
  ('a0000000-0000-4000-a000-000000000005', 'SOLICITANTE',       'Solicitante',          'Creación de tickets de cualquier tipo')
ON CONFLICT (codigo) DO NOTHING;

-- ─── PERMISOS (11 permisos atómicos — convención recurso:accion) ──────────────
-- id: UUID fijo determinista (prefijo b0000000-0000-4000-b000) para estabilidad cross-env.
-- descripcion: verbatim del spec auth-rbac tabla de permisos.
-- created_at / updated_at: omitidos (DEFAULT CURRENT_TIMESTAMP en la tabla).

INSERT INTO permisos (id, codigo, descripcion) VALUES
  ('b0000000-0000-4000-b000-000000000001', 'ticket:crear',       'Crear ticket de cualquier tipo'),
  ('b0000000-0000-4000-b000-000000000002', 'ticket:asignar',     'Asignar o reasignar ticket'),
  ('b0000000-0000-4000-b000-000000000003', 'ticket:cerrar',      'Cerrar/cancelar ticket'),
  ('b0000000-0000-4000-b000-000000000004', 'ticket:ver_todos',   'Ver tickets de otros usuarios (no solo los propios)'),
  ('b0000000-0000-4000-b000-000000000005', 'compra:aprobar',     'Aprobar o rechazar ticket de compra'),
  ('b0000000-0000-4000-b000-000000000006', 'compra:gestionar',   'Crear/editar items y presupuestos de compra'),
  ('b0000000-0000-4000-b000-000000000007', 'subtarea:actualizar','Marcar subtareas edilicias como completadas'),
  ('b0000000-0000-4000-b000-000000000008', 'equipo:gestionar',   'Alta/baja/modificación de equipos informáticos'),
  ('b0000000-0000-4000-b000-000000000009', 'usuario:gestionar',  'Crear/modificar/desactivar usuarios'),
  ('b0000000-0000-4000-b000-000000000010', 'rol:asignar',        'Asignar o quitar roles a usuarios'),
  ('b0000000-0000-4000-b000-000000000011', 'cliente:gestionar',  'Crear/modificar clientes (solo ROOT/ADMIN global)')
ON CONFLICT (codigo) DO NOTHING;

-- ─── ROLES_PERMISOS (mapeo base) ──────────────────────────────────────────────
-- Usa SELECT JOIN por codigo para no depender de los UUIDs concretos de roles/permisos.
-- Funciona aunque los roles/permisos ya existieran con IDs distintos (entornos con data previa).
-- created_at: omitido (DEFAULT CURRENT_TIMESTAMP en la tabla).

-- ADMIN → TODOS los permisos (explícito en spec: "ADMIN tiene todos los permisos")
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permisos p
WHERE r.codigo = 'ADMIN'
ON CONFLICT (rol_id, permiso_id) DO NOTHING;

-- SOPORTE_IT → ticket:crear, ticket:asignar, ticket:cerrar, ticket:ver_todos, equipo:gestionar
-- [SPEC-EXPLICIT: ticket:crear + ticket:ver_todos (scenario de unión de permisos auth-rbac)]
-- [INFERRED: ticket:asignar, ticket:cerrar, equipo:gestionar por dominio del rol]
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permisos p
WHERE r.codigo = 'SOPORTE_IT'
  AND p.codigo IN ('ticket:crear', 'ticket:asignar', 'ticket:cerrar', 'ticket:ver_todos', 'equipo:gestionar')
ON CONFLICT (rol_id, permiso_id) DO NOTHING;

-- MANTENIMIENTO → ticket:crear, ticket:ver_todos, subtarea:actualizar
-- [INFERRED: gestiona subtareas edilicias (ref: task 5.D.1 — guard subtarea:actualizar)]
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permisos p
WHERE r.codigo = 'MANTENIMIENTO'
  AND p.codigo IN ('ticket:crear', 'ticket:ver_todos', 'subtarea:actualizar')
ON CONFLICT (rol_id, permiso_id) DO NOTHING;

-- APROBADOR_COMPRAS → ticket:crear, ticket:ver_todos, compra:aprobar, compra:gestionar
-- [SPEC-EXPLICIT: ticket:crear + compra:aprobar (scenario de unión de permisos auth-rbac)]
-- [INFERRED: ticket:ver_todos (necesita ver todos los tickets), compra:gestionar (gestión de presupuestos)]
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permisos p
WHERE r.codigo = 'APROBADOR_COMPRAS'
  AND p.codigo IN ('ticket:crear', 'ticket:ver_todos', 'compra:aprobar', 'compra:gestionar')
ON CONFLICT (rol_id, permiso_id) DO NOTHING;

-- SOLICITANTE → ticket:crear
-- [INFERRED: rol más básico — solo puede crear tickets, no asignarlos ni cerrarlos]
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permisos p
WHERE r.codigo = 'SOLICITANTE'
  AND p.codigo IN ('ticket:crear')
ON CONFLICT (rol_id, permiso_id) DO NOTHING;
