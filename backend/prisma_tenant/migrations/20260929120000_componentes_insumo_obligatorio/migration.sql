-- sdd/catalogo-unico-componentes (ADR-4): el componente pasa a salir siempre del
-- catalogo de repuestos. UNA sola sentencia: guard y DDL son atomicos sin depender
-- de que Prisma envuelva la migracion en una transaccion.
--
-- El guard cuenta TODAS las filas, incluidas las borradas logicamente, porque el
-- SET NOT NULL tambien las alcanza. Una tabla vacia lo pasa.
-- Irreversible: revertir el codigo exige restaurar el dump previo.
DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM "componentes_equipo" WHERE "insumo_id" IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'componentes_equipo: % fila(s) con insumo_id NULL (incluye borradas logicamente). Correr backend/scripts/limpiar-componentes-sin-insumo.mjs', n;
  END IF;
  ALTER TABLE "componentes_equipo" ALTER COLUMN "insumo_id" SET NOT NULL;
  DROP INDEX "componentes_equipo_tipo_componente_codigo_idx";
  ALTER TABLE "componentes_equipo" DROP COLUMN "tipo_componente_codigo";
END $$;
