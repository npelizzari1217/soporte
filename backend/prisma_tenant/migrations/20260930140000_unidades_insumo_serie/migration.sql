-- sdd/repuestos-numero-de-serie (ADR-1, ADR-9): unidades por numero de serie.
-- Migracion UNICA y aditiva del ciclo: todo entra con defaults inertes o columnas NULL,
-- asi que un binario anterior sigue funcionando y las filas existentes no cambian.
-- Fuentes unicas en TypeScript que los CHECK espejan (las compara el spec de constraints):
--   SEGUIMIENTOS_INSUMO, ESTADOS_UNIDAD_INSUMO, TIPOS_EVENTO_UNIDAD, CONDICIONES_STOCK
--   (src/insumos/domain/entities/).

-- 1) unidades_medida.entera: la cantidad de un insumo de esta unidad solo admite enteros.
ALTER TABLE "unidades_medida" ADD COLUMN "entera" BOOLEAN NOT NULL DEFAULT false;
UPDATE "unidades_medida" SET "entera" = true WHERE "codigo" IN ('UNI', 'PAR');

-- 2) insumos.seguimiento: NINGUNO (por cantidad, como hasta hoy) o SERIE (una unidad por pieza).
ALTER TABLE "insumos"
  ADD COLUMN "seguimiento" VARCHAR(10) NOT NULL DEFAULT 'NINGUNO',
  ADD CONSTRAINT "insumos_seguimiento_check" CHECK ("seguimiento" IN ('NINGUNO', 'SERIE'));

-- 3) unidades_insumo: una fila por pieza de un insumo SERIE. Serie pendiente = numero_serie NULL.
CREATE TABLE "unidades_insumo" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "insumo_id" UUID NOT NULL,
  "numero_serie" VARCHAR(255),
  "numero_serie_normalizado" VARCHAR(255),
  "condicion" VARCHAR(10) NOT NULL,
  "estado" VARCHAR(15) NOT NULL,
  "equipo_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "unidades_insumo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "unidades_insumo_condicion_check" CHECK ("condicion" IN ('NUEVO', 'USADO')),
  CONSTRAINT "unidades_insumo_estado_check"
    CHECK ("estado" IN ('EN_DEPOSITO', 'INSTALADA', 'ENTREGADA', 'DESCARTADA')),
  -- Una INSTALADA refiere su equipo; una ENTREGADA no (su destino vive en el movimiento de la SALIDA).
  CONSTRAINT "unidades_insumo_equipo_coherente_check"
    CHECK (("estado" = 'INSTALADA') = ("equipo_id" IS NOT NULL)),
  -- Una pendiente (sin serial) nunca esta instalada ni entregada; si puede terminar descartada (F1).
  CONSTRAINT "unidades_insumo_serie_pendiente_check"
    CHECK ("numero_serie" IS NOT NULL OR "estado" IN ('EN_DEPOSITO', 'DESCARTADA')),
  CONSTRAINT "unidades_insumo_serie_normalizada_check"
    CHECK (("numero_serie" IS NULL) = ("numero_serie_normalizado" IS NULL))
);

ALTER TABLE "unidades_insumo"
  ADD CONSTRAINT "unidades_insumo_insumo_id_fkey"
    FOREIGN KEY ("insumo_id") REFERENCES "insumos"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "unidades_insumo_equipo_id_fkey"
    FOREIGN KEY ("equipo_id") REFERENCES "equipos_informaticos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Unicidad del serial por insumo, sobre la forma normalizada y en TODOS los estados (incluida DESCARTADA).
CREATE UNIQUE INDEX "unidades_insumo_insumo_id_numero_serie_normalizado_key"
  ON "unidades_insumo"("insumo_id", "numero_serie_normalizado")
  WHERE "numero_serie_normalizado" IS NOT NULL;
CREATE INDEX "unidades_insumo_insumo_id_estado_idx" ON "unidades_insumo"("insumo_id", "estado");
CREATE INDEX "unidades_insumo_equipo_id_idx" ON "unidades_insumo"("equipo_id") WHERE "equipo_id" IS NOT NULL;

-- 4) movimientos_insumo.unidad_id: la pieza a la que refiere el movimiento (una por movimiento).
ALTER TABLE "movimientos_insumo"
  ADD COLUMN "unidad_id" UUID,
  ADD CONSTRAINT "movimientos_insumo_unidad_id_fkey"
    FOREIGN KEY ("unidad_id") REFERENCES "unidades_insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "movimientos_insumo_unidad_cantidad_check"
    CHECK ("unidad_id" IS NULL OR "cantidad" = 1);
CREATE INDEX "movimientos_insumo_unidad_id_idx"
  ON "movimientos_insumo"("unidad_id") WHERE "unidad_id" IS NOT NULL;

-- 5) componentes_equipo.unidad_id: el componente instalado desde una unidad. Con unidad, el serial
-- no es texto libre. El UNIQUE parcial admite la unidad devuelta y reinstalada en otro equipo
-- (el componente retirado conserva su historial).
ALTER TABLE "componentes_equipo"
  ADD COLUMN "unidad_id" UUID,
  ADD CONSTRAINT "componentes_equipo_unidad_id_fkey"
    FOREIGN KEY ("unidad_id") REFERENCES "unidades_insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "componentes_equipo_unidad_sin_serie_texto_check"
    CHECK ("unidad_id" IS NULL OR "numero_serie" IS NULL);
CREATE UNIQUE INDEX "componentes_equipo_unidad_id_activo_key"
  ON "componentes_equipo"("unidad_id")
  WHERE "unidad_id" IS NOT NULL AND "deleted_at" IS NULL;

-- 6) eventos_unidad_insumo (ADR-9): bitacora append-only de la unidad.
-- componente_id y usuario_id van SIN FK a proposito: la instalacion escribe el evento antes que
-- el componente (orden de locks, ADR-12) con el id ya generado en memoria, y usuario_id es una
-- soft ref a master.usuarios.id. movimiento_id es UNIQUE: un movimiento origina a lo sumo un evento.
CREATE TABLE "eventos_unidad_insumo" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "unidad_id" UUID NOT NULL,
  "tipo" VARCHAR(25) NOT NULL,
  "movimiento_id" UUID,
  "equipo_id" UUID,
  "componente_id" UUID,
  "serial_anterior" VARCHAR(255),
  "serial_nuevo" VARCHAR(255),
  "motivo" TEXT,
  "usuario_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "eventos_unidad_insumo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "eventos_unidad_insumo_tipo_check" CHECK ("tipo" IN (
    'INGRESO', 'ALTA_INSTALADA', 'SERIAL_CARGADO', 'CORRECCION_SERIAL', 'INSTALACION',
    'RETIRO_A_DEPOSITO', 'DESCARTE', 'ENTREGA', 'DEVOLUCION_DE_ENTREGA', 'BAJA_DE_DEPOSITO',
    'RECUPERACION', 'REACTIVACION'
  ))
);

ALTER TABLE "eventos_unidad_insumo"
  ADD CONSTRAINT "eventos_unidad_insumo_unidad_id_fkey"
    FOREIGN KEY ("unidad_id") REFERENCES "unidades_insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "eventos_unidad_insumo_movimiento_id_fkey"
    FOREIGN KEY ("movimiento_id") REFERENCES "movimientos_insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "eventos_unidad_insumo_equipo_id_fkey"
    FOREIGN KEY ("equipo_id") REFERENCES "equipos_informaticos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "eventos_unidad_insumo_movimiento_id_key" ON "eventos_unidad_insumo"("movimiento_id");
CREATE INDEX "eventos_unidad_insumo_unidad_id_created_at_idx"
  ON "eventos_unidad_insumo"("unidad_id", "created_at");
