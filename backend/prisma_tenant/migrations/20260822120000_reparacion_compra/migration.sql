-- Vínculo REPARACIÓN ↔ COMPRA (`reparacion_compra`).
--
-- POR QUÉ a nivel de CABECERA y no de ItemCompra: el vínculo dice "esta
-- reparación espera esta compra". La compra entera es la unidad que el usuario
-- ya entiende en /compras, y el grupo de estado del que se deriva el bloqueo
-- (`derivarGrupoEstadoCompra`) también es de cabecera.
--
-- HARD DELETE, SIN deleted_at — y acá se APARTA a propósito de
-- `comentarios_reparacion`: un vínculo equivocado es un ERROR DE DATO, no el
-- dicho de una persona. Un soft delete obligaría a arrastrar `deleted_at IS
-- NULL` en toda lectura y a una UNIQUE parcial, a cambio de un historial que
-- nadie pidió. Si mañana hace falta bitácora, la migración es ADITIVA.
--
-- SIN updated_at: el vínculo no se edita — se crea o se borra.
--
-- created_at: marca de INICIO del bloqueo. La métrica de tiempo bloqueado está
-- fuera de alcance (no existe la métrica de la que descontar), pero el dato
-- queda disponible sin costo.

-- CreateTable
CREATE TABLE "reparacion_compra" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_edilicia_id" UUID NOT NULL,
    "compra_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reparacion_compra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- UNIQUE sobre el par: vincular dos veces la misma compra a la misma
-- reparación no significa nada distinto de vincularla una vez (el estado se
-- deriva de ">=1 compra ACTIVAS"), pero SÍ duplicaría la fila en "qué compras
-- la frenan". Además le da idempotencia al endpoint de vincular (doble clic,
-- reintento de red) vía ON CONFLICT DO NOTHING — sin check-then-insert, que
-- tiene ventana de carrera.
-- SIMPLE, no parcial: no hay soft delete que excluir.
-- Su PREFIJO IZQUIERDO (ticket_edilicia_id) ya cubre el lote del listado, así
-- que NO se agrega un índice separado sobre ticket_edilicia_id.
CREATE UNIQUE INDEX "reparacion_compra_ticket_compra_key"
    ON "reparacion_compra"("ticket_edilicia_id", "compra_id");

-- SIN índice sobre (compra_id): la dirección inversa (qué reparaciones destraba
-- una compra) está FUERA DE ALCANCE. Un índice sin consulta que lo use es costo
-- de escritura sin beneficio; el día que exista esa vista, se agrega con ella.

-- AddForeignKey
-- ON DELETE RESTRICT en las DOS: borrar una compra o una reparación no debe
-- llevarse en silencio la explicación de por qué estuvo parada (mismo criterio
-- que `comentarios_reparacion`). En la práctica ambas tablas usan soft delete,
-- así que RESTRICT es un backstop, no el camino normal.
ALTER TABLE "reparacion_compra" ADD CONSTRAINT "reparacion_compra_ticket_edilicia_id_fkey"
    FOREIGN KEY ("ticket_edilicia_id") REFERENCES "ticket_edilicia"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reparacion_compra" ADD CONSTRAINT "reparacion_compra_compra_id_fkey"
    FOREIGN KEY ("compra_id") REFERENCES "compras"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- SIN CHECK, y es deliberado: no hay ninguna invariante de columna que
-- expresar. Las dos FKs y la UNIQUE agotan las reglas estructurales de esta
-- tabla — un CHECK decorativo sería ruido.
