-- Migration: 20260923150000_seed_feriados_moviles_y_trasladables
-- Issue #214 (proyecto soporte)
--
-- `20260909130000_seed_feriados_nacionales_inamovibles` sembró los 9 feriados
-- nacionales de FECHA FIJA y dejó anotada, de frente, la carencia: los MÓVILES
-- dependen de la fecha de Pascua de cada año y los TRASLADABLES se corren por
-- regla legal, así que no eran fechas fijas reproducibles en esa migración.
--
-- Esta las repone. Sin ellas, el cálculo de SLA sobre horas hábiles trata unos
-- 7 días por año como días hábiles, y el número de cumplimiento que ve el
-- cliente sale mal. El primero encima es el 12 de octubre de 2026.
--
-- Carencia adicional que apareció al hacerlo: el **17 de junio (Güemes)** no
-- estaba sembrado de ninguna forma. No es móvil; es uno de los cuatro
-- trasladables del artículo 1 de la ley 27.399, y quedó fuera de la lista de
-- inamovibles. Lo que sí estaba sembrado es el 20 de junio (Belgrano), que es
-- otro feriado.
--
-- ─── De dónde sale cada fecha ────────────────────────────────────────────────
--
-- MÓVILES — calculados desde la Pascua de cada año con el algoritmo gregoriano
-- anónimo. Carnaval es el lunes y el martes 48 y 47 días antes de Pascua;
-- Viernes Santo es 2 días antes. Aritmética pura: cualquiera puede reproducir
-- estas 9 fechas sin consultar un calendario oficial.
--
--     Pascua 2026-04-05 · 2027-03-28 · 2028-04-16
--
-- TRASLADABLES — artículo 6 de la ley 27.399, textual: "los feriados nacionales
-- trasladables cuyas fechas coincidan con los días martes y miércoles serán
-- trasladados al día lunes anterior. Los que coincidan con los días jueves y
-- viernes serán trasladados al día lunes siguiente". El que cae lunes se queda
-- donde está.
--
-- ─── Las DOS fechas que NO se siembran, y por qué ────────────────────────────
--
--   · 20 de noviembre de 2027 — cae SÁBADO
--   · 17 de junio de 2028     — cae SÁBADO
--
-- El artículo 6 no cubre el fin de semana. El decreto 614/2025 dice que esos
-- feriados **podrán** moverse al lunes o viernes más próximo: "podrán" es
-- discrecional, la fecha la fija un decreto caso por caso, no una regla
-- reproducible. Sembrar una fecha inventada sería PEOR que la ausencia — un
-- feriado en el día equivocado corre el vencimiento de todos los tickets de esa
-- semana, y encima en silencio. Se dejan afuera a propósito, declaradas acá.
--
-- Mismo motivo por el que esto llega hasta 2028 y no más: a partir de 2029 la
-- tabla se vacía igual que antes. La salida de fondo no es sembrar más años, es
-- que alguien pueda cargar un feriado sin escribir una migración — hoy el módulo
-- `calendario-laboral` no tiene capa HTTP y eso no lo puede hacer nadie.
--
-- ─── Forma ───────────────────────────────────────────────────────────────────
--
-- `updated_at` no tiene DEFAULT (Prisma gestiona `@updatedAt` en la capa de
-- aplicación), así que el INSERT lo setea explícito — mismo criterio que las dos
-- migraciones de seed anteriores.
--
-- Idempotencia: ON CONFLICT (fecha) DO NOTHING sobre el unique
-- `feriados_fecha_key`. Correrla dos veces no duplica filas ni pisa una edición
-- manual posterior.

INSERT INTO "feriados" ("id", "fecha", "descripcion", "created_at", "updated_at") VALUES
  -- 2026 — móviles (Pascua 2026-04-05)
  (gen_random_uuid(), '2026-02-16', 'Carnaval', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-02-17', 'Carnaval', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-04-03', 'Viernes Santo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- 2026 — trasladables
  (gen_random_uuid(), '2026-06-15', 'Paso a la Inmortalidad del General Martín Miguel de Güemes (trasladado del 17/06, miércoles)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-08-17', 'Paso a la Inmortalidad del General José de San Martín', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-10-12', 'Día del Respeto a la Diversidad Cultural', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-11-23', 'Día de la Soberanía Nacional (trasladado del 20/11, viernes)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  -- 2027 — móviles (Pascua 2027-03-28)
  (gen_random_uuid(), '2027-02-08', 'Carnaval', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2027-02-09', 'Carnaval', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2027-03-26', 'Viernes Santo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- 2027 — trasladables (falta el 20/11: cae sábado, ver cabecera)
  (gen_random_uuid(), '2027-06-21', 'Paso a la Inmortalidad del General Martín Miguel de Güemes (trasladado del 17/06, jueves)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2027-08-16', 'Paso a la Inmortalidad del General José de San Martín (trasladado del 17/08, martes)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2027-10-11', 'Día del Respeto a la Diversidad Cultural (trasladado del 12/10, martes)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  -- 2028 — móviles (Pascua 2028-04-16)
  (gen_random_uuid(), '2028-02-28', 'Carnaval', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2028-02-29', 'Carnaval', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2028-04-14', 'Viernes Santo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- 2028 — trasladables (falta el 17/06: cae sábado, ver cabecera)
  (gen_random_uuid(), '2028-08-21', 'Paso a la Inmortalidad del General José de San Martín (trasladado del 17/08, jueves)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2028-10-16', 'Día del Respeto a la Diversidad Cultural (trasladado del 12/10, jueves)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2028-11-20', 'Día de la Soberanía Nacional', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("fecha") DO NOTHING;
