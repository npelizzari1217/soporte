-- Migration: 20260910120100_seed_familias_insumo_repuesto
-- WU-1 — sdd/repuestos-familias (proyecto soporte)
--
-- Siembra el piso de 11 familias universales de repuesto en los DOS
-- inquilinos que ya existen (uno con 0 familias, otro con 2: TONNER y LIMP,
-- que quedan intactas y con es_repuesto = false porque son consumibles, no
-- repuestos). Un inquilino NUEVO recibe el mismo piso por el otro camino —
-- `TenantSeederAdapter.seed()` — no por esta migración: ver su
-- FAMILIAS_INSUMO_REPUESTO.
--
-- DE DÓNDE SALEN el código y el nombre de cada fila, y por qué importa:
-- salen VERBATIM del catálogo `master.tipos_componente` VIGENTE EN
-- PRODUCCIÓN (14 filas), verificado por SSH contra el VPS el 2026-09-10 —
-- NO de la migración de seed `20260810120100_seed_tipos_componente` (10
-- filas) ni del master LOCAL de desarrollo, que todavía tiene esas mismas
-- 10 filas con DISCO activo. Esa migración documenta cómo ARRANCÓ el
-- catálogo, no lo que hay hoy: nadie sincroniza el master local con lo que
-- ROOT carga después en producción vía el ABM de `tipos-componente`
-- (catálogo editable, ver `backend/src/tipos-componente/`), así que ambos
-- divergen a propósito. El catálogo de producción pasa a ser la PLANTILLA
-- desde la que se siembra cada inquilino.
--
-- `SSD` ("Discos SSD") y `HDD` ("Disco HDD") suenan raros en plural/orden
-- porque son los nombres reales cargados en producción — no se normalizan.
-- Los códigos coinciden a propósito con los de `tipos_componente` para que
-- los componentes de equipo ya cargados resuelvan solos contra la familia
-- local en un WU posterior.
--
-- QUEDAN FUERA de las 11, a propósito:
--   - CPU2 ("Central processador Unidad"): duplicado de CPU que alguien
--     cargó en producción porque el catálogo compartido no le alcanzaba.
--     Es la evidencia de por qué el catálogo de repuestos pasa a ser POR
--     INQUILINO en este WU, no un motivo para reproducir el duplicado.
--   - EST500W ("Estabilizadores de 500W"): específico de un cliente, ningún
--     componente lo usa.
--   - DISCO: activo en el master LOCAL de desarrollo, pero DESACTIVADO en
--     producción, superado por HDD y SSD.
--
-- Idempotencia: ON CONFLICT (codigo) DO NOTHING — mismo criterio que
-- 20260810120100_seed_tipos_componente. Ningún inquilino tiene hoy alguno
-- de estos 11 códigos, así que esta corrida no pisa nada; una segunda
-- corrida tampoco duplicaría filas.
--
-- `updated_at` NO tiene DEFAULT en la migración
-- `20260904140000_catalogo_insumos` (Prisma gestiona `@updatedAt` en la
-- capa de aplicación) — el INSERT raw SQL lo setea explícito, mismo
-- criterio que `20260909130000_seed_feriados_nacionales_inamovibles`.

INSERT INTO "familias_insumo" ("id", "codigo", "nombre", "activo", "es_repuesto", "created_at", "updated_at") VALUES
  (gen_random_uuid(), 'CPU', 'CPU', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOUSE', 'Mouse', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'TECLADO', 'Teclado', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'RAM', 'Memoria RAM', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MONITOR', 'Monitor', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'FUENTE', 'Fuente de alimentación', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'GPU', 'Placa de video', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'RED', 'Placa de red', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SSD', 'Discos SSD', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'HDD', 'Disco HDD', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'IMPRESORA', 'Impresora', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("codigo") DO NOTHING;
