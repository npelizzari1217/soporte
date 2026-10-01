-- sdd/baja-equipo-completo (ADR-1): el equipo conserva el registro de su baja.
-- Aditiva y sin backfill: las cinco columnas son nullable y ninguna fila existente se modifica.
-- baja_usuario_id es referencia blanda a master (sin FK), igual que componentes_equipo.baja_usuario_id.
ALTER TABLE "equipos_informaticos"
  ADD COLUMN "baja_destino" VARCHAR(20),
  ADD COLUMN "baja_categoria" VARCHAR(20),
  ADD COLUMN "baja_motivo" TEXT,
  ADD COLUMN "baja_fecha" TIMESTAMPTZ,
  ADD COLUMN "baja_usuario_id" UUID;

-- Catalogos cerrados; fuente unica en TypeScript: DESTINOS_BAJA_EQUIPO y CATEGORIAS_BAJA_EQUIPO.
-- El CHECK coherente: un equipo vigente nunca lleva datos de baja; uno dado de baja lleva los
-- datos completos (el motivo solo es obligatorio con la categoria OTRA) o ninguno. La rama sin
-- datos admite una fila historica con activo = false, para que la migracion nunca aborte.
ALTER TABLE "equipos_informaticos"
  ADD CONSTRAINT "equipos_informaticos_baja_destino_check"
    CHECK ("baja_destino" IN ('STOCK_USADO', 'DESCARTE')),
  ADD CONSTRAINT "equipos_informaticos_baja_categoria_check"
    CHECK ("baja_categoria" IN ('VEJEZ', 'DONACION', 'ROTURA', 'OTRA')),
  ADD CONSTRAINT "equipos_informaticos_baja_coherente_check" CHECK (
    ("activo" AND "baja_destino" IS NULL AND "baja_categoria" IS NULL AND "baja_motivo" IS NULL
       AND "baja_fecha" IS NULL AND "baja_usuario_id" IS NULL)
    OR (NOT "activo" AND (
         ("baja_destino" IS NULL AND "baja_categoria" IS NULL AND "baja_motivo" IS NULL
            AND "baja_fecha" IS NULL AND "baja_usuario_id" IS NULL)
      OR ("baja_destino" IS NOT NULL AND "baja_categoria" IS NOT NULL AND "baja_fecha" IS NOT NULL
            AND "baja_usuario_id" IS NOT NULL AND ("baja_categoria" <> 'OTRA' OR "baja_motivo" IS NOT NULL))))
  );
