-- Comentarios a nivel de REPARACIÓN (`comentarios_reparacion`).
--
-- POR QUÉ una tabla propia y no `operaciones_ticket`: el caso real es dejar
-- asentado por qué una reparación se demora ("falta el repuesto X"). Eso es
-- una nota del operador sobre la reparación, no un evento del ciclo de vida
-- del ticket base — `operaciones_ticket` es la bitácora de EVENTOS (cambio de
-- estado, asignación, avance) y sumarle un tipo "comentario edilicio"
-- mezclaría dos cosas con lecturas y permisos distintos. El comentario cuelga
-- del SATÉLITE `ticket_edilicia`, que es el agregado que el usuario ve en
-- `/edilicia`, no del ticket.
--
-- SIN updated_at NI deleted_at: bitácora append-only (mismo criterio
-- ESTRUCTURAL que `operaciones_compra`, ADR-C4). Un comentario no se edita ni
-- se borra — la ausencia de las columnas complementa la firma del puerto
-- (`crear`/`listarPorTicketEdilicia`, sin update/delete).
--
-- autor_id: soft ref → master.usuarios.id, SIN FK (master y tenant son bases
-- de datos distintas). El nombre se resuelve en la capa de presentación vía
-- `IUsuarioMasterChecker.resolverNombres`, igual que `TicketResponseDto`.
--
-- ON DELETE RESTRICT sobre ticket_edilicia: borrar una reparación no debe
-- llevarse en silencio su historial de comentarios.

-- CreateTable
CREATE TABLE "comentarios_reparacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_edilicia_id" UUID NOT NULL,
    "texto" TEXT NOT NULL,
    "autor_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comentarios_reparacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Compuesto (ticket_edilicia_id, created_at): cubre la ÚNICA consulta del
-- listado — los comentarios de una reparación ordenados por fecha (el
-- endpoint los devuelve DESC, y un índice B-tree se recorre en ambos
-- sentidos).
CREATE INDEX "comentarios_reparacion_ticket_created_at_idx" ON "comentarios_reparacion"("ticket_edilicia_id", "created_at");

-- AddForeignKey
ALTER TABLE "comentarios_reparacion" ADD CONSTRAINT "comentarios_reparacion_ticket_edilicia_id_fkey" FOREIGN KEY ("ticket_edilicia_id") REFERENCES "ticket_edilicia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint (raw SQL — Prisma no expresa CHECK en el schema declarativo)
-- Texto obligatorio y acotado. `btrim` en el CHECK, y no solo `<> ''`: un
-- comentario de puros espacios no aporta nada y no debe poder persistirse ni
-- aunque un caller futuro saltee el DTO. El tope de 2000 caracteres acota el
-- payload del listado (un comentario operativo es un párrafo, no un
-- documento); `descripcion` de subtarea es VarChar(255), que alcanza para un
-- renglón pero no para explicar una demora.
ALTER TABLE "comentarios_reparacion" ADD CONSTRAINT "comentarios_reparacion_texto_check" CHECK (
    char_length(btrim("texto")) BETWEEN 1 AND 2000
);
