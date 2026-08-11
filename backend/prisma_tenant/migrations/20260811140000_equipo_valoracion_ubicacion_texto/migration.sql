-- Equipos: ubicación FK → texto libre (empezar de cero, se descarta el vínculo
-- previo a `ubicaciones`) + campos de valoración/depreciación.
--
-- Al dropear la columna, Postgres elimina automáticamente su FK y su índice.
ALTER TABLE "equipos_informaticos" DROP COLUMN "ubicacion_id";

-- Ubicación como texto libre (siempre en mayúscula, normalizado en la app).
ALTER TABLE "equipos_informaticos" ADD COLUMN "ubicacion" VARCHAR(255);

-- Valoración: importe (valor del equipo) + fecha de la valoración.
ALTER TABLE "equipos_informaticos" ADD COLUMN "importe" DECIMAL(14, 2);
ALTER TABLE "equipos_informaticos" ADD COLUMN "fecha_valoracion" DATE;

-- Observaciones libres del técnico.
ALTER TABLE "equipos_informaticos" ADD COLUMN "observaciones" TEXT;

-- Valor residual (post-depreciación) + fecha del cálculo. El % de depreciación
-- NO se persiste: es una ayuda de cálculo en la UI que deriva el valor residual.
ALTER TABLE "equipos_informaticos" ADD COLUMN "valor_residual" DECIMAL(14, 2);
ALTER TABLE "equipos_informaticos" ADD COLUMN "fecha_valor_residual" DATE;
