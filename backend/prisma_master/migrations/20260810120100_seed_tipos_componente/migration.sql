-- Migration: 20260810120100_seed_tipos_componente
-- PR1 — sdd/tipos-componente-master (proyecto soporte)
--
-- Siembra los 10 códigos base del catálogo MASTER de tipos de componente,
-- mismos codigo/nombre que el catálogo tenant sembrado en provisioning
-- (`clientes/infrastructure/tenant-seeder.adapter.ts`, TIPOS_COMPONENTE_BASE)
-- para mantener consistencia visual entre ambos catálogos.
--
-- Idempotencia (mismo patrón que 20260805110000_seed_rbac_4_roles_permisos):
--   ON CONFLICT (codigo) DO NOTHING — correr esta migración más de una vez
--   no duplica filas ni pisa ediciones manuales posteriores del catálogo.
--
-- UUIDs deterministas (estabilidad cross-environment, mismo patrón que
-- roles/permisos): prefijo c0000000-0000-4000-c000.
--
-- Nota: `updated_at` NO tiene DEFAULT en la migración
-- `add_tipos_componente` (Prisma gestiona `@updatedAt` en la capa de
-- aplicación) — el INSERT raw SQL lo setea explícito o viola el NOT NULL.

INSERT INTO tipos_componente (id, codigo, nombre, updated_at) VALUES
  ('c0000000-0000-4000-c000-000000000001', 'CPU', 'CPU', CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-c000-000000000002', 'RAM', 'Memoria RAM', CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-c000-000000000003', 'DISCO', 'Disco', CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-c000-000000000004', 'MONITOR', 'Monitor', CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-c000-000000000005', 'TECLADO', 'Teclado', CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-c000-000000000006', 'MOUSE', 'Mouse', CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-c000-000000000007', 'GPU', 'Placa de video', CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-c000-000000000008', 'FUENTE', 'Fuente de alimentación', CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-c000-000000000009', 'IMPRESORA', 'Impresora', CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-c000-000000000010', 'RED', 'Placa de red', CURRENT_TIMESTAMP)
ON CONFLICT (codigo) DO NOTHING;
