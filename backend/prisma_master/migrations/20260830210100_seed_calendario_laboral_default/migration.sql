-- Migration: 20260830210100_seed_calendario_laboral_default
-- WU-1 — sdd/sla-habil (proyecto soporte)
--
-- Siembra las 7 filas fijas del calendario laboral: lunes a viernes
-- 09:00–18:00 (540/1080 minutos desde la medianoche), sábado y domingo
-- cerrados (ambos extremos NULL). `dia_semana` 0..6 = domingo..sábado, mismo
-- criterio que `Date.getUTCDay()` (ver comentario en schema.prisma).
--
-- Idempotencia (mismo patrón que 20260810120100_seed_tipos_componente):
--   ON CONFLICT (dia_semana) DO NOTHING — correr esta migración más de una
--   vez no pisa ediciones manuales posteriores del calendario vía el ABM
--   (WU-6).
--
-- Nota: `updated_at` NO tiene DEFAULT en la migración `add_calendario_laboral`
-- (Prisma gestiona `@updatedAt` en la capa de aplicación) — el INSERT raw SQL
-- lo setea explícito o viola el NOT NULL.

INSERT INTO calendario_laboral_dias (dia_semana, apertura_minuto, cierre_minuto, updated_at) VALUES
  (0, NULL, NULL, CURRENT_TIMESTAMP), -- domingo: cerrado
  (1, 540, 1080, CURRENT_TIMESTAMP),  -- lunes: 09:00–18:00
  (2, 540, 1080, CURRENT_TIMESTAMP),  -- martes: 09:00–18:00
  (3, 540, 1080, CURRENT_TIMESTAMP),  -- miércoles: 09:00–18:00
  (4, 540, 1080, CURRENT_TIMESTAMP),  -- jueves: 09:00–18:00
  (5, 540, 1080, CURRENT_TIMESTAMP),  -- viernes: 09:00–18:00
  (6, NULL, NULL, CURRENT_TIMESTAMP)  -- sábado: cerrado
ON CONFLICT (dia_semana) DO NOTHING;
