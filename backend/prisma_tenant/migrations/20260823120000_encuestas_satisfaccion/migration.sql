-- Respuestas de la encuesta CSAT (`encuestas_satisfaccion`, sdd/csat, WU2).
--
-- Vive en el TENANT: la respuesta (puntaje, comentario) es un dato del
-- ticket, no del token — el token opaco que la habilita vive en MASTER
-- (`encuesta_tokens`, WU1) porque `ResolverEncuestaTokenService` necesita
-- leer `cliente_id` ANTES de abrir el `TenantContext` (ADR-C1, sdd/csat/design).
--
-- `token_id` UUID NOT NULL UNIQUE: soft ref al `id` de `encuesta_tokens` de
-- MASTER. SIN FK cross-DB (bases físicas distintas). Este UNIQUE es la
-- MITAD del mecanismo de uso único (ADR-C2): la otra mitad es el
-- compare-and-swap sobre `used_at` en MASTER (WU5). No hay transacción
-- entre las dos bases, así que este constraint real de Postgres es la
-- última línea de defensa contra una doble respuesta si el orden
-- CAS→insert se rompe.
--
-- `puntaje` SMALLINT con CHECK 1-5 (raw SQL, Prisma no expresa CHECK en el
-- schema declarativo) — igual criterio que `PuntajeCsat` (WU4), pero acá
-- reforzado a nivel DB: ningún caller futuro que saltee el dominio puede
-- persistir un puntaje inválido.
--
-- `comentario` opcional: no toda respuesta trae texto.
--
-- `respondida_en`: momento de la respuesta (no `created_at` — un ticket
-- reabierto puede tener varias filas, y el DISTINCT ON del promedio
-- (ADR-C8) ordena por esta columna, no por `created_at`).
--
-- created_at/updated_at/deleted_at: mismo criterio estructural que el resto
-- de las entidades del tenant con identidad propia (soft delete universal).

-- CreateTable
CREATE TABLE "encuestas_satisfaccion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "token_id" UUID NOT NULL,
    "puntaje" SMALLINT NOT NULL,
    "comentario" TEXT,
    "respondida_en" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "encuestas_satisfaccion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- UNIQUE sobre token_id: ver nota de cabecera (ADR-C2, mitad tenant del uso único).
CREATE UNIQUE INDEX "encuestas_satisfaccion_token_id_key" ON "encuestas_satisfaccion"("token_id");

-- CreateIndex
-- (ticket_id, respondida_en DESC): sirve directo el DISTINCT ON del promedio
-- de dashboard (ADR-C8) — un ticket reabierto con varias respuestas solo
-- pesa la última. El orden DESC importa: es el que necesita
-- "ORDER BY ticket_id, respondida_en DESC" para que el DISTINCT ON tome la
-- fila más reciente por ticket.
CREATE INDEX "encuestas_satisfaccion_ticket_id_respondida_en_idx" ON "encuestas_satisfaccion"("ticket_id", "respondida_en" DESC);

-- AddForeignKey
-- ON DELETE RESTRICT: borrar un ticket no debe llevarse en silencio su
-- respuesta de satisfacción (mismo criterio que `comentarios_reparacion` /
-- `reparacion_compra`). En la práctica los tickets usan soft delete, así
-- que RESTRICT es un backstop, no el camino normal.
ALTER TABLE "encuestas_satisfaccion" ADD CONSTRAINT "encuestas_satisfaccion_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint (raw SQL — Prisma no expresa CHECK en el schema declarativo)
ALTER TABLE "encuestas_satisfaccion" ADD CONSTRAINT "encuestas_satisfaccion_puntaje_check" CHECK (
    "puntaje" BETWEEN 1 AND 5
);
