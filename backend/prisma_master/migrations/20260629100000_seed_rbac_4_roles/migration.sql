-- Migration: 20260629100000_seed_rbac_4_roles
-- Change: tickets-rbac-4-roles — PR1 / Tasks T1.10–T1.11
-- Ref design: ADR-1
--
-- Siembra los 4 nuevos roles jerárquicos acumulativos (a0..006–009),
-- 2 permisos nuevos (b0..018–019) y la matriz de roles_permisos completa.
-- REEMPLAZA la asignación provisional de Change A en roles legacy (esos siguen
-- sin tocar aquí; el freeze + remap es PR2).
--
-- Idempotencia:
--   roles/permisos:  ON CONFLICT (codigo) DO NOTHING
--   roles_permisos:  ON CONFLICT (rol_id, permiso_id) DO NOTHING
--   La join se llena via SELECT JOIN por codigo — no hardcodea UUIDs de roles en el join.
--
-- UUID reference (autoritativo — tasks.md §UUID Reference):
--   USUARIO       → a0000000-0000-4000-a000-000000000006
--   COLABORADOR   → a0000000-0000-4000-a000-000000000007
--   TECNICO       → a0000000-0000-4000-a000-000000000008
--   ADMINISTRADOR → a0000000-0000-4000-a000-000000000009
--   ciclo:gestionar  → b0000000-0000-4000-b000-000000000018  (next free after ...017)
--   ticket:comentar  → b0000000-0000-4000-b000-000000000019
--
-- Contrato Change A (NO recrear, referenciar por codigo):
--   ticket:observar     b0..014   ticket:transicionar b0..015
--   ticket:aprobar      b0..016   ticket:rechazar     b0..017
--
-- Totales por rol: USUARIO=2, COLABORADOR=7, TECNICO=14, ADMINISTRADOR=19.

-- ─── T1.10: ROLES nuevos (4 roles jerárquicos) ───────────────────────────────
-- Los roles legacy a0..001–005 NO se tocan. El next UUID libre es a0..006.

INSERT INTO roles (id, codigo, nombre, descripcion) VALUES
  ('a0000000-0000-4000-a000-000000000006', 'USUARIO',
    'Usuario',
    'Usuario del sistema — creación de tickets y comentarios'),
  ('a0000000-0000-4000-a000-000000000007', 'COLABORADOR',
    'Colaborador',
    'Colabora en la gestión y aprobación de tickets'),
  ('a0000000-0000-4000-a000-000000000008', 'TECNICO',
    'Técnico',
    'Ejecuta, transiciona y observa tickets técnicos'),
  ('a0000000-0000-4000-a000-000000000009', 'ADMINISTRADOR',
    'Administrador',
    'Acceso completo al sistema — gestión global de usuarios, roles y clientes')
ON CONFLICT (codigo) DO NOTHING;

-- ─── T1.10: PERMISOS nuevos (2 permisos) ─────────────────────────────────────
-- ticket:editar..ticket:rechazar (b0..012–017) ya existen en migraciones anteriores.
-- El próximo UUID libre es b0..018.

INSERT INTO permisos (id, codigo, descripcion) VALUES
  ('b0000000-0000-4000-b000-000000000018', 'ciclo:gestionar',
    'Crear y gestionar ciclos de trabajo vigentes'),
  ('b0000000-0000-4000-b000-000000000019', 'ticket:comentar',
    'Registrar un comentario en un ticket (sin transición de estado)')
ON CONFLICT (codigo) DO NOTHING;

-- ─── T1.11: ROLES_PERMISOS — matriz acumulativa completa ─────────────────────
-- SELECT JOIN por codigo: no hardcodea UUIDs de roles en la join.
-- Mismo patrón que las migraciones anteriores (seed_rbac_base, etc.).

-- USUARIO (2 permisos):
--   ticket:crear (b0..001) + ticket:comentar (b0..019, NEW)
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permisos p
WHERE r.codigo = 'USUARIO'
  AND p.codigo IN ('ticket:crear', 'ticket:comentar')
ON CONFLICT (rol_id, permiso_id) DO NOTHING;

-- COLABORADOR (7 permisos = USUARIO + 5):
--   + ticket:ver_todos (b0..004), compra:gestionar (b0..006), compra:aprobar (b0..005)
--   + ticket:aprobar (b0..016, Change A), ticket:rechazar (b0..017, Change A)
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
--   + ticket:editar (b0..012), ticket:transicionar (b0..015, Change A)
--   + ticket:observar (b0..014, Change A), ticket:asignar (b0..002)
--   + ticket:cerrar (b0..003), equipo:gestionar (b0..008), subtarea:actualizar (b0..007)
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
--   + ticket:eliminar (b0..013), usuario:gestionar (b0..009)
--   + rol:asignar (b0..010), cliente:gestionar (b0..011), ciclo:gestionar (b0..018, NEW)
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
