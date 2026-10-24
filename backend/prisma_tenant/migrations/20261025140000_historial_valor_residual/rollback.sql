-- Rollback de 20261025140000_historial_valor_residual. Re-ejecutable.
--
-- Borra la tabla del historial entera. Las filas de migración se reconstruyen al reaplicar la
-- migración (salen de `equipos_informaticos`, que este rollback no toca), pero las filas MANUAL
-- registradas después del deploy SE PIERDEN: son el único registro de los valores anteriores al
-- vigente de cada equipo. Antes de correrlo en un tenant con uso real, hacer un dump de la tabla.
DROP TABLE IF EXISTS "equipo_valoraciones";
