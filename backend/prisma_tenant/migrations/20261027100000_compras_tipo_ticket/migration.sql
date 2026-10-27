-- odd/compras-por-tipo T1: tipo de ticket de cada compra (S1, S4).
-- - tipo_ticket_id: el tipo decide quien ve la compra (LECTURA sobre el tipo) y quien la crea o se
--   la asigna (ALTAS sobre el tipo). Cualquier tipo del catalogo.
-- - Nullable y sin backfill (S4): las compras existentes quedan sin tipo, y una compra sin tipo la
--   ve cualquiera con LECTURA de Compras hasta que se le asigne uno. El alta nueva exige tipo y una
--   compra con tipo no vuelve a quedar sin tipo, pero eso lo decide la aplicacion: la columna no
--   puede ser NOT NULL mientras existan compras viejas.
-- - FK RESTRICT, como tickets.tipo_id y planes_preventivo.tipo_id: la baja de un tipo es logica
--   (deleted_at), asi que un tipo con compras no se borra fisicamente.
-- - Indice parcial: el listado filtra por los tipos que ve el actor, y las compras sin tipo no
--   necesitan entrada.
ALTER TABLE "compras" ADD COLUMN "tipo_ticket_id" UUID;

-- AddForeignKey
ALTER TABLE "compras" ADD CONSTRAINT "compras_tipo_ticket_id_fkey"
    FOREIGN KEY ("tipo_ticket_id") REFERENCES "tipos_ticket"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "compras_tipo_ticket_id_idx" ON "compras" ("tipo_ticket_id")
    WHERE "tipo_ticket_id" IS NOT NULL;
