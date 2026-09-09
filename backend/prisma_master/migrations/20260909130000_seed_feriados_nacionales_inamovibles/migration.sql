-- Migration: 20260909130000_seed_feriados_nacionales_inamovibles
-- WU-2 — sdd/sla-habil (proyecto soporte)
--
-- La tabla `feriados` está VACÍA en producción (0 filas): sin esto, el
-- cálculo de SLA en horas hábiles (WU-1) trata el 1 de mayo como día hábil.
-- Esta migración siembra únicamente los feriados NACIONALES INAMOVIBLES de
-- fecha fija (ley 27.399), para 2026, 2027 y 2028:
--   1 enero, 24 marzo, 2 abril, 1 mayo, 25 mayo, 20 junio, 9 julio,
--   8 diciembre, 25 diciembre.
--
-- LO QUE **NO** SE SIEMBRA ACÁ, y por qué — carencia deliberada, no oculta:
--   - Carnaval (lunes y martes) y Viernes Santo son MÓVILES: dependen de la
--     fecha de Pascua de cada año, que no se calcula en esta migración.
--   - Los feriados TRASLADABLES (17 de agosto, 12 de octubre, 20 de
--     noviembre) se mueven al lunes más cercano por decreto/regla del
--     calendario oficial — no son una fecha fija reproducible acá.
--   - Los feriados "con fines turísticos" (puentes) se fijan por decreto
--     cada año, sin fecha ni cantidad garantizada de antemano.
--   Hoy NO HAY ABM para cargar estos tres grupos: no existe endpoint ni
--   pantalla que escriba en `feriados` (verificado el 2026-09-09). Hay que
--   cargarlos a mano vía INSERT directo hasta que ese ABM exista. Tratar el 1 de mayo (fijo) como
--   único feriado cargado sería peor que no cargar nada: subestimaría los
--   días no hábiles reales.
--
-- `updated_at` NO tiene DEFAULT en la migración `add_calendario_laboral`
-- (Prisma gestiona `@updatedAt` en la capa de aplicación) — el INSERT raw
-- SQL lo setea explícito, mismo criterio que `seed_calendario_laboral_default`.
--
-- Idempotencia: ON CONFLICT (fecha) DO NOTHING — el UNIQUE INDEX
-- `feriados_fecha_key` ya cubre esa columna. Correr esta migración más de
-- una vez no duplica filas ni pisa una edición manual posterior.

INSERT INTO "feriados" ("id", "fecha", "descripcion", "created_at", "updated_at") VALUES
  (gen_random_uuid(), '2026-01-01', 'Año Nuevo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-05-01', 'Día del Trabajador', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-05-25', 'Día de la Revolución de Mayo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-06-20', 'Paso a la Inmortalidad del General Manuel Belgrano', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-07-09', 'Día de la Independencia', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-12-08', 'Inmaculada Concepción de María', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2026-12-25', 'Navidad', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  (gen_random_uuid(), '2027-01-01', 'Año Nuevo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2027-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2027-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2027-05-01', 'Día del Trabajador', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2027-05-25', 'Día de la Revolución de Mayo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2027-06-20', 'Paso a la Inmortalidad del General Manuel Belgrano', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2027-07-09', 'Día de la Independencia', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2027-12-08', 'Inmaculada Concepción de María', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2027-12-25', 'Navidad', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  (gen_random_uuid(), '2028-01-01', 'Año Nuevo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2028-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2028-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2028-05-01', 'Día del Trabajador', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2028-05-25', 'Día de la Revolución de Mayo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2028-06-20', 'Paso a la Inmortalidad del General Manuel Belgrano', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2028-07-09', 'Día de la Independencia', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2028-12-08', 'Inmaculada Concepción de María', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), '2028-12-25', 'Navidad', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("fecha") DO NOTHING;
