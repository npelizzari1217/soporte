-- Historial del valor de un equipo (odd/tasks/historial-valor-residual.md, S1-S4).
--
-- `equipo_valoraciones` guarda una fila por equipo y día de calendario: el UNIQUE
-- (`equipo_id`, `fecha`) implementa "el último del día" (S3), y el código hace upsert sobre él.
-- La tabla es de solo agregado: ningún flujo borra filas. La FK al equipo es RESTRICT porque los
-- equipos se borran de forma lógica, y un borrado físico no puede arrastrar el historial.
--
-- `importe` usa la misma precisión que `equipos_informaticos.valor_residual` (DECIMAL(14,2)). Sin
-- CHECK de rango, igual que esa columna: el techo y el piso los valida el dominio, y un CHECK que
-- la columna de origen no tiene haría abortar el backfill ante una fila histórica fuera de rango.
--
-- `origen` es un catálogo cerrado; su fuente única en TypeScript es ORIGENES_VALORACION_EQUIPO.
-- `usuario_id` es referencia blanda a master (sin FK, igual que `eventos_unidad_insumo.usuario_id`):
-- quien guardó el valor, o NULL en las filas de migración.
--
-- El índice del UNIQUE (`equipo_id`, `fecha`) es también el del listado del historial de un equipo
-- ordenado por fecha: no hace falta un segundo índice.
--
-- Re-ejecutable: la tabla y el índice se crean con IF NOT EXISTS y el backfill no pisa filas
-- existentes (ON CONFLICT DO NOTHING).
CREATE TABLE IF NOT EXISTS "equipo_valoraciones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "equipo_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "importe" DECIMAL(14, 2) NOT NULL,
    "origen" VARCHAR(20) NOT NULL,
    "usuario_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "equipo_valoraciones_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "equipo_valoraciones_origen_check" CHECK ("origen" IN ('MANUAL', 'MIGRACION')),
    CONSTRAINT "equipo_valoraciones_equipo_id_fkey" FOREIGN KEY ("equipo_id")
        REFERENCES "equipos_informaticos"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "equipo_valoraciones_equipo_id_fecha_key"
    ON "equipo_valoraciones"("equipo_id", "fecha");

-- Backfill (S4): el historial de los equipos existentes arranca con sus valores actuales, hasta dos
-- filas por equipo, marcadas MIGRACION y sin usuario. Solo los equipos sin borrado lógico: uno
-- borrado fue cargado por error y su ficha ya no se puede abrir.
--
-- Primero el valor residual, después el importe: si los dos tienen la misma fecha, el ON CONFLICT
-- deja la fila del valor residual, igual que S3 deja el último valor guardado del día.
INSERT INTO "equipo_valoraciones" ("equipo_id", "fecha", "importe", "origen", "usuario_id", "updated_at")
SELECT e."id", e."fecha_valor_residual", e."valor_residual", 'MIGRACION', NULL, CURRENT_TIMESTAMP
FROM "equipos_informaticos" e
WHERE e."deleted_at" IS NULL
  AND e."valor_residual" IS NOT NULL
  AND e."fecha_valor_residual" IS NOT NULL
ON CONFLICT ("equipo_id", "fecha") DO NOTHING;

INSERT INTO "equipo_valoraciones" ("equipo_id", "fecha", "importe", "origen", "usuario_id", "updated_at")
SELECT e."id", e."fecha_valoracion", e."importe", 'MIGRACION', NULL, CURRENT_TIMESTAMP
FROM "equipos_informaticos" e
WHERE e."deleted_at" IS NULL
  AND e."importe" IS NOT NULL
  AND e."fecha_valoracion" IS NOT NULL
ON CONFLICT ("equipo_id", "fecha") DO NOTHING;
