-- Migration: 20260910130000_add_componente_equipo_insumo_id
-- WU-3 — sdd/repuestos-vinculo-componente (proyecto soporte)
--
-- Agrega `componentes_equipo.insumo_id`, FK REAL y NULLABLE hacia
-- `insumos.id`. Es una FK de verdad -y no un soft-ref como
-- `tipo_componente_codigo`- porque `ComponenteEquipo` e `Insumo` viven en la
-- MISMA base del inquilino: no hay cruce de bases que evitar acá.
--
-- NULLABLE a propósito y sin backfill: el camino de texto libre para agregar
-- un componente sigue siendo válido, y los componentes que ya existen en
-- producción no tienen (ni se les inventa) un repuesto vinculado.
--
-- ON DELETE RESTRICT, mismo criterio que las cuatro FK de
-- `movimientos_insumo` hacia sus catálogos (ver esa migración): un insumo
-- referenciado por un componente no se borra por debajo en silencio. En la
-- práctica `insumos` no tiene DELETE físico (solo baja lógica vía `activo`),
-- así que esta restricción es defensiva, no una que se vaya a disparar en
-- el uso normal.
ALTER TABLE "componentes_equipo" ADD COLUMN "insumo_id" UUID;

ALTER TABLE "componentes_equipo"
  ADD CONSTRAINT "componentes_equipo_insumo_id_fkey"
  FOREIGN KEY ("insumo_id") REFERENCES "insumos"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "componentes_equipo_insumo_id_idx" ON "componentes_equipo"("insumo_id");
