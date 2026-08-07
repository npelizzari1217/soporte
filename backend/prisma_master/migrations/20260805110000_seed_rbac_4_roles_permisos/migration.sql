-- Migration: 20260805110000_seed_rbac_4_roles_permisos
-- PR1 — Fase 1 "Auth & Multi-tenancy" (proyecto soporte)
-- Ref spec: sdd/auth-multitenancy/spec §R1 (Área A — RBAC & Bootstrap)
-- Ref design: sdd/auth-multitenancy/design ADR-1
--
-- Siembra los 4 roles jerárquicos acumulativos del sistema (USUARIO,
-- COLABORADOR, TECNICO, ADMINISTRADOR), los 19 permisos atómicos y la matriz
-- completa roles_permisos. A diferencia de soporte1 (que llegó a esta matriz
-- en 4 migraciones incrementales sobre 5 roles legacy), este proyecto es
-- greenfield: una única migración siembra el catálogo final completo.
--
-- Idempotencia:
--   roles/permisos:  ON CONFLICT (codigo) DO NOTHING
--   roles_permisos:  ON CONFLICT (rol_id, permiso_id) DO NOTHING
--   La join se llena vía SELECT JOIN por codigo — no hardcodea UUIDs de roles
--   en el join (sobrevive a entornos donde los roles ya existan con IDs
--   distintos).
--
-- UUIDs deterministas (estabilidad cross-environment, mismo patrón que
-- soporte1): prefijo a0000000-0000-4000-a000 para roles, b0000000-0000-4000-b000
-- para permisos.
--
--   USUARIO       → a0000000-0000-4000-a000-000000000001
--   COLABORADOR   → a0000000-0000-4000-a000-000000000002
--   TECNICO       → a0000000-0000-4000-a000-000000000003
--   ADMINISTRADOR → a0000000-0000-4000-a000-000000000004
--
-- NOTA (spec R1): ROOT NO es un rol de esta tabla — es `usuarios.is_global_admin`
-- (ver bootstrap en `prisma_master/seeds/root-bootstrap.seed.ts`). `cliente:gestionar`
-- = gestionar usuarios/subclientes DENTRO del propio tenant, NO crear tenants
-- nuevos (exclusivo de ROOT). `ciclo:gestionar` = adoptar/activar ciclos del
-- tenant, NO crear el catálogo master de ciclos (exclusivo de ROOT).
--
-- Totales por rol (matriz acumulativa exacta, copiada verbatim de soporte1
-- rbac-4-roles-seed): USUARIO=2, COLABORADOR=7, TECNICO=14, ADMINISTRADOR=19.

-- ─── ROLES (4 roles jerárquicos acumulativos) ─────────────────────────────────

-- Nota: `updated_at` NO tiene DEFAULT en la migración init_master (solo
-- `created_at` lo tiene) — Prisma gestiona `@updatedAt` en la capa de
-- aplicación, no vía default de columna. Un INSERT raw SQL debe setearlo
-- explícito o viola el NOT NULL.

INSERT INTO roles (id, codigo, nombre, descripcion, updated_at) VALUES
  ('a0000000-0000-4000-a000-000000000001', 'USUARIO',
    'Usuario',
    'Usuario del sistema — creación de tickets y comentarios', CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-a000-000000000002', 'COLABORADOR',
    'Colaborador',
    'Colabora en la gestión y aprobación de tickets', CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-a000-000000000003', 'TECNICO',
    'Técnico',
    'Ejecuta, transiciona y observa tickets técnicos', CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-a000-000000000004', 'ADMINISTRADOR',
    'Administrador',
    'Acceso completo al sistema — gestión global de usuarios, roles y clientes', CURRENT_TIMESTAMP)
ON CONFLICT (codigo) DO NOTHING;

-- ─── PERMISOS (19 permisos atómicos — convención recurso:accion) ─────────────

INSERT INTO permisos (id, codigo, descripcion, updated_at) VALUES
  ('b0000000-0000-4000-b000-000000000001', 'ticket:crear',
    'Crear ticket de cualquier tipo', CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-b000-000000000002', 'ticket:comentar',
    'Registrar un comentario en un ticket (sin transición de estado)', CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-b000-000000000003', 'ticket:ver_todos',
    'Ver tickets de otros usuarios (no solo los propios)', CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-b000-000000000004', 'compra:gestionar',
    'Crear/editar items y presupuestos de compra', CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-b000-000000000005', 'compra:aprobar',
    'Aprobar o rechazar ticket de compra', CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-b000-000000000006', 'ticket:aprobar',
    'Aprobar un ticket (arco ABIERTO → APROBADO)', CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-b000-000000000007', 'ticket:rechazar',
    'Rechazar un ticket (arco ABIERTO → RECHAZADO)', CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-b000-000000000008', 'ticket:editar',
    'Editar campos de datos de un ticket', CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-b000-000000000009', 'ticket:transicionar',
    'Realizar transiciones técnicas de estado de un ticket', CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-b000-000000000010', 'ticket:observar',
    'Registrar una observación técnica en un ticket', CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-b000-000000000011', 'ticket:asignar',
    'Asignar o reasignar ticket', CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-b000-000000000012', 'ticket:cerrar',
    'Cerrar/cancelar ticket', CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-b000-000000000013', 'equipo:gestionar',
    'Alta/baja/modificación de equipos informáticos', CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-b000-000000000014', 'subtarea:actualizar',
    'Marcar subtareas edilicias como completadas', CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-b000-000000000015', 'ticket:eliminar',
    'Dar de baja (soft-delete) un ticket', CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-b000-000000000016', 'usuario:gestionar',
    'Crear/modificar/desactivar usuarios', CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-b000-000000000017', 'rol:asignar',
    'Asignar o quitar roles a usuarios', CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-b000-000000000018', 'cliente:gestionar',
    'Gestionar usuarios y datos del cliente (tenant) propio — NO crea tenants nuevos (exclusivo de ROOT)', CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-b000-000000000019', 'ciclo:gestionar',
    'Adoptar y activar ciclos de trabajo vigentes en el tenant — NO crea el catálogo master (exclusivo de ROOT)', CURRENT_TIMESTAMP)
ON CONFLICT (codigo) DO NOTHING;

-- ─── ROLES_PERMISOS — matriz acumulativa completa (SELECT JOIN por codigo) ───
-- No hardcodea UUIDs de roles/permisos en la join: sobrevive a entornos donde
-- ya existan con IDs distintos.

-- USUARIO (2 permisos): ticket:crear, ticket:comentar
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permisos p
WHERE r.codigo = 'USUARIO'
  AND p.codigo IN ('ticket:crear', 'ticket:comentar')
ON CONFLICT (rol_id, permiso_id) DO NOTHING;

-- COLABORADOR (7 permisos = USUARIO + 5):
--   + ticket:ver_todos, compra:gestionar, compra:aprobar, ticket:aprobar, ticket:rechazar
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permisos p
WHERE r.codigo = 'COLABORADOR'
  AND p.codigo IN (
    'ticket:crear', 'ticket:comentar',
    'ticket:ver_todos', 'compra:gestionar', 'compra:aprobar',
    'ticket:aprobar', 'ticket:rechazar'
  )
ON CONFLICT (rol_id, permiso_id) DO NOTHING;

-- TECNICO (14 permisos = COLABORADOR + 7):
--   + ticket:editar, ticket:transicionar, ticket:observar, ticket:asignar,
--     ticket:cerrar, equipo:gestionar, subtarea:actualizar
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permisos p
WHERE r.codigo = 'TECNICO'
  AND p.codigo IN (
    'ticket:crear', 'ticket:comentar',
    'ticket:ver_todos', 'compra:gestionar', 'compra:aprobar',
    'ticket:aprobar', 'ticket:rechazar',
    'ticket:editar', 'ticket:transicionar', 'ticket:observar',
    'ticket:asignar', 'ticket:cerrar', 'equipo:gestionar', 'subtarea:actualizar'
  )
ON CONFLICT (rol_id, permiso_id) DO NOTHING;

-- ADMINISTRADOR (19 permisos = TECNICO + 5):
--   + ticket:eliminar, usuario:gestionar, rol:asignar, cliente:gestionar, ciclo:gestionar
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permisos p
WHERE r.codigo = 'ADMINISTRADOR'
  AND p.codigo IN (
    'ticket:crear', 'ticket:comentar',
    'ticket:ver_todos', 'compra:gestionar', 'compra:aprobar',
    'ticket:aprobar', 'ticket:rechazar',
    'ticket:editar', 'ticket:transicionar', 'ticket:observar',
    'ticket:asignar', 'ticket:cerrar', 'equipo:gestionar', 'subtarea:actualizar',
    'ticket:eliminar', 'usuario:gestionar', 'rol:asignar', 'cliente:gestionar', 'ciclo:gestionar'
  )
ON CONFLICT (rol_id, permiso_id) DO NOTHING;
