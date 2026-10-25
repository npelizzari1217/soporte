-- Rollback de 20261026100000_horario_laboral_usuario. Re-ejecutable.
--
-- Borra la tabla entera: se pierden los horarios propios cargados después del deploy, y todos los
-- usuarios vuelven a medirse con el horario del tenant. Antes de correrlo en un tenant con uso
-- real, hacer un dump de la tabla. No toca `calendario_laboral_dias_cliente`.
DROP TABLE IF EXISTS "horario_laboral_usuario";
