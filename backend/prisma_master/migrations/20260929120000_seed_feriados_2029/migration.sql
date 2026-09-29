-- Migration: 20260929120000_seed_feriados_2029
--
-- Las dos migraciones de seed anteriores cubren 2026, 2027 y 2028. Sin esta,
-- desde el 1 de enero de 2029 la tabla `feriados` queda vacia para ese año y el
-- calculo de SLA en horas habiles trata todos los feriados nacionales como dias
-- habiles, en silencio.
--
-- Mismas reglas y mismo formato que
-- `20260909130000_seed_feriados_nacionales_inamovibles` (fecha fija) y
-- `20260923150000_seed_feriados_moviles_y_trasladables` (moviles y
-- trasladables); ver sus cabeceras para el detalle legal.
--
-- ─── De donde sale cada fecha ────────────────────────────────────────────────
--
-- INAMOVIBLES — los 9 de fecha fija de la ley 27.399. Se siembran aunque caigan
-- en fin de semana (24/03 y 08/12 de 2029 caen sabado), igual que en los años
-- anteriores: un inamovible no se corre.
--
-- MOVILES — desde la Pascua con el algoritmo gregoriano anonimo, el mismo que
-- reproduce las Pascuas ya sembradas (2026-04-05, 2027-03-28, 2028-04-16).
--     Pascua 2029-04-01 -> Carnaval 12 y 13 de febrero, Viernes Santo 30 de marzo.
--
-- TRASLADABLES — articulo 6 de la ley 27.399: martes y miercoles van al lunes
-- anterior; jueves y viernes, al lunes siguiente; el lunes se queda.
--     17/08 viernes -> lunes 20/08 · 12/10 viernes -> lunes 15/10 ·
--     20/11 martes -> lunes 19/11
--
-- ─── La fecha que NO se siembra, y por que ───────────────────────────────────
--
--   · 17 de junio de 2029 (Guemes) — cae DOMINGO
--
-- El articulo 6 no cubre el fin de semana; el decreto 614/2025 dice que
-- "podra" moverse, a criterio de un decreto caso por caso. Mismo criterio que
-- los dos casos de 2027 y 2028: una fecha inventada es peor que la ausencia. Si
-- el decreto de 2029 lo corre, lo carga un ROOT desde /admin/feriados-globales.
--
-- Tampoco se siembran los feriados puente: los fija un decreto cada año.
--
-- ─── Forma ───────────────────────────────────────────────────────────────────
--
-- `updated_at` no tiene DEFAULT (Prisma gestiona `@updatedAt`), asi que el
-- INSERT lo setea explicito. Idempotencia: ON CONFLICT (fecha) DO NOTHING sobre
-- el unique `feriados_fecha_key`; tampoco pisa una carga manual previa desde el
-- ABM.

INSERT INTO "feriados" ("id", "fecha", "descripcion", "created_at", "updated_at") VALUES
  -- 2029 — inamovibles
  (gen_random_uuid(), '2029-01-01', 'Año Nuevo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2029-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2029-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2029-05-01', 'Día del Trabajador', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2029-05-25', 'Día de la Revolución de Mayo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2029-06-20', 'Paso a la Inmortalidad del General Manuel Belgrano', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2029-07-09', 'Día de la Independencia', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2029-12-08', 'Inmaculada Concepción de María', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2029-12-25', 'Navidad', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- 2029 — moviles (Pascua 2029-04-01)
  (gen_random_uuid(), '2029-02-12', 'Carnaval', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2029-02-13', 'Carnaval', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2029-03-30', 'Viernes Santo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- 2029 — trasladables (falta el 17/06: cae domingo, ver cabecera)
  (gen_random_uuid(), '2029-08-20', 'Paso a la Inmortalidad del General José de San Martín (trasladado del 17/08, viernes)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2029-10-15', 'Día del Respeto a la Diversidad Cultural (trasladado del 12/10, viernes)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2029-11-19', 'Día de la Soberanía Nacional (trasladado del 20/11, martes)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("fecha") DO NOTHING;
