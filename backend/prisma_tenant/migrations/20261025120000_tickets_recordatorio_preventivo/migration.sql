-- odd/preventivo-anticipacion T3: recordatorio al responsable 1 dia antes de la fecha objetivo (S4).
-- - recordatorio_enviado_at: TIMESTAMPTZ nullable, sin backfill. Lo marca el barrido diario en la
--   MISMA transaccion en que reclama el ticket (UPDATE ... WHERE recordatorio_enviado_at IS NULL), antes
--   de publicar el aviso post-commit: es la marca de "una sola vez". NULL = recordatorio no enviado.
--   Lo escribe solo ese UPDATE acotado, nunca el upsert de la entidad.
-- - Indice parcial sobre fecha_objetivo para la busqueda diaria: solo tickets con fecha objetivo y
--   sin recordatorio, que son una fraccion minima de la tabla.
ALTER TABLE "tickets" ADD COLUMN "recordatorio_enviado_at" TIMESTAMPTZ;

CREATE INDEX "tickets_recordatorio_pendiente_idx" ON "tickets"("fecha_objetivo")
    WHERE "fecha_objetivo" IS NOT NULL AND "recordatorio_enviado_at" IS NULL;
