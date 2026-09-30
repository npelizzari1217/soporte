-- sdd/stock-usado-componentes (ADR-2): el componente conserva el registro de su retiro
-- y el vinculo con los movimientos de stock que lo originaron o lo recibieron.
-- Aditiva: todas las columnas son nullable y ninguna fila existente se modifica. Los
-- retiros legados quedan con todo en NULL y pasan la primera rama del CHECK coherente.
ALTER TABLE "componentes_equipo"
  ADD COLUMN "instalacion_movimiento_id" UUID,
  ADD COLUMN "baja_destino" VARCHAR(20),
  ADD COLUMN "baja_motivo" TEXT,
  ADD COLUMN "baja_movimiento_id" UUID,
  ADD COLUMN "baja_usuario_id" UUID;

-- Un movimiento respalda a lo sumo un componente (UNIQUE) y no se puede borrar por debajo
-- (RESTRICT). Los UNIQUE sirven ademas de indice para "que componente origino este movimiento".
CREATE UNIQUE INDEX "componentes_equipo_instalacion_movimiento_id_key"
  ON "componentes_equipo"("instalacion_movimiento_id");
CREATE UNIQUE INDEX "componentes_equipo_baja_movimiento_id_key"
  ON "componentes_equipo"("baja_movimiento_id");

ALTER TABLE "componentes_equipo"
  ADD CONSTRAINT "componentes_equipo_instalacion_movimiento_id_fkey"
    FOREIGN KEY ("instalacion_movimiento_id") REFERENCES "movimientos_insumo"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "componentes_equipo_baja_movimiento_id_fkey"
    FOREIGN KEY ("baja_movimiento_id") REFERENCES "movimientos_insumo"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Catalogo cerrado de destinos; fuente unica en TypeScript: DESTINOS_RETIRO_COMPONENTE.
-- El CHECK coherente exige deleted_at para que un componente ACTIVO nunca informe un destino
-- (backstop: un binario anterior no puede reactivar un STOCK_USADO, que ya volvio al stock).
ALTER TABLE "componentes_equipo"
  ADD CONSTRAINT "componentes_equipo_baja_destino_check"
    CHECK ("baja_destino" IN ('STOCK_USADO', 'DESCARTE')),
  ADD CONSTRAINT "componentes_equipo_baja_coherente_check" CHECK (
    ("baja_destino" IS NULL AND "baja_motivo" IS NULL AND "baja_movimiento_id" IS NULL AND "baja_usuario_id" IS NULL)
    OR ("baja_destino" = 'DESCARTE' AND "deleted_at" IS NOT NULL AND "baja_motivo" IS NOT NULL
        AND "baja_movimiento_id" IS NULL AND "baja_usuario_id" IS NOT NULL)
    OR ("baja_destino" = 'STOCK_USADO' AND "deleted_at" IS NOT NULL
        AND "baja_movimiento_id" IS NOT NULL AND "baja_usuario_id" IS NOT NULL)
  );
