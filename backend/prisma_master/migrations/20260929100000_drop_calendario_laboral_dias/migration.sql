-- Dropea `calendario_laboral_dias` (master).
--
-- Desde `horario-laboral-por-cliente` (desplegado el 2026-09-29, 64555d6) el horario
-- laboral vive en `calendario_laboral_dias_cliente` de cada base de inquilino y esta tabla
-- quedó sin lectores. Se mantuvo como red de rollback hasta confirmar el deploy; el
-- dueño decidió borrarla el 2026-09-29.
--
-- `feriados` NO se toca: sigue siendo el catálogo global de feriados.
-- Rollback: `rollback.sql` recrea la tabla con su CHECK y las 7 filas del default.
DROP TABLE "calendario_laboral_dias";
