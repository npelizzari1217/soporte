-- Migration: 20260627010000_seed_tipo_operacion_edicion_eliminacion
-- Change: tickets-editar-borrar — S1-T4
-- Ref spec: [SPEC:tickets-core/Seed de tipo_operacion EDICION y ELIMINACION presente en todo tenant]
--
-- Migración data-only: siembra 2 tipos de operación nuevos en la DB tenant.
-- Aplica a todos los tenants EXISTENTES vía scripts/migrate-tenants.ts (fan-out).
-- Los tenants NUEVOS los reciben por el seeder (prisma_tenant/seeds/tenant-seed.ts).
--
-- Tabla: tipo_operacion (id, codigo, nombre) — UNIQUE ON codigo
-- Idempotente: ON CONFLICT (codigo) DO NOTHING
--
-- UUIDs deterministas serie f0... (próximos libres tras f0...006 UBICACION_ELIMINADA):
--   EDICION     → f0000000-0000-4000-f000-000000000007
--   ELIMINACION → f0000000-0000-4000-f000-000000000008

INSERT INTO tipo_operacion (id, codigo, nombre) VALUES
  ('f0000000-0000-4000-f000-000000000007', 'EDICION',     'Edición'),
  ('f0000000-0000-4000-f000-000000000008', 'ELIMINACION', 'Eliminación')
ON CONFLICT (codigo) DO NOTHING;
