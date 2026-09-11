-- Migration: 20260911120000_seed_unidades_medida
-- issue #155 (proyecto soporte)
--
-- Siembra el piso de 4 unidades de medida en los inquilinos que YA EXISTEN.
-- Un inquilino recién creado no podía dar de alta NINGÚN insumo: el alta
-- exige elegir una unidad y `unidades_medida` nace vacía. El #147 ya había
-- sembrado las 11 familias de repuesto para que Repuestos funcionara de
-- entrada, pero sin unidad de medida el alta de insumo seguía bloqueada — el
-- seed llegaba solo hasta la mitad del camino.
--
-- Un inquilino NUEVO recibe el mismo piso por el otro camino —
-- `TenantSeederAdapter.seed()` — no por esta migración: ver su constante
-- `UNIDADES_MEDIDA`.
--
-- DE DÓNDE SALEN los 4 códigos, y por qué importa: mismo criterio que el
-- #147 con `familias_insumo` — se copia lo que el negocio YA USA de verdad,
-- no una lista inventada. Verificado contra las dos bases reales (issue
-- #155): el inquilino "Cic Lanus" tenía 0 unidades de medida (bloqueado) y
-- el inquilino "Santa Cruz" ya tenía estas 4 cargadas A MANO — la evidencia
-- de que son las que el negocio usa:
--   - UNI  → Unidad
--   - PAR  → Pares
--   - CM   → Centímetro
--   - MM   → Milímetro
--
-- Idempotencia: ON CONFLICT (codigo) DO NOTHING — mismo criterio que
-- 20260910120100_seed_familias_insumo_repuesto. "Santa Cruz" ya tiene estos
-- 4 códigos cargados a mano: esta corrida no los duplica ni los pisa (las
-- filas manuales conservan su id, su nombre y sus timestamps originales);
-- "Cic Lanus", que no tenía ninguno, recibe las 4 filas nuevas.
--
-- `updated_at` NO tiene DEFAULT en la migración `20260904140000_catalogo_insumos`
-- (Prisma gestiona `@updatedAt` en la capa de aplicación) — el INSERT raw SQL
-- lo setea explícito, mismo criterio que
-- `20260910120100_seed_familias_insumo_repuesto`.

INSERT INTO "unidades_medida" ("id", "codigo", "nombre", "activo", "created_at", "updated_at") VALUES
  (gen_random_uuid(), 'UNI', 'Unidad', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PAR', 'Pares', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'CM', 'Centímetro', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MM', 'Milímetro', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("codigo") DO NOTHING;
