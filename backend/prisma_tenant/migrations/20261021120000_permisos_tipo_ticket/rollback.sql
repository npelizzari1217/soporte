-- Rollback de 20261021120000_permisos_tipo_ticket. DESTRUCTIVO: borra los permisos por tipo
-- concedidos. Mientras la matriz master siga vigente (S7, retiro en T9), el backfill los
-- reconstruye; los cambios hechos a mano después del backfill se pierden.
DROP TABLE IF EXISTS "permisos_tipo_ticket";
