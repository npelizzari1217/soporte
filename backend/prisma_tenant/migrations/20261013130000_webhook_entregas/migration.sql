-- Tabla `webhook_entregas` (odd/webhooks, T2): cola y registro de los avisos de webhook del cliente.
--
-- Una fila por aviso. Su `id` es el id de entrega: no cambia entre reintentos, y el receptor lo usa
-- para descartar duplicados. `payload` es el cuerpo exacto, congelado al encolar. Nace vacía.
--
-- `ticket_id` es una referencia blanda a `tickets.id`, sin FK: el registro es una bitácora de
-- salida que se purga a los 30 días por su cuenta, y no debe frenar ni arrastrar el borrado de un
-- ticket. El resumen del ticket ya viaja copiado en `payload`.
--
-- Índices: (`estado`, `proximo_intento_at`) para el barrido de vencidas; `created_at` para el
-- listado (más nuevas primero) y la purga.
CREATE TABLE "webhook_entregas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "evento" VARCHAR(40) NOT NULL,
    "ticket_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "estado" VARCHAR(16) NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximo_intento_at" TIMESTAMPTZ NOT NULL,
    "ultimo_codigo" INTEGER,
    "ultimo_error" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entregada_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "webhook_entregas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "webhook_entregas_estado_check"
        CHECK ("estado" IN ('PENDIENTE', 'ENTREGADA', 'FALLIDA')),
    CONSTRAINT "webhook_entregas_intentos_check" CHECK ("intentos" >= 0)
);

CREATE INDEX "webhook_entregas_estado_proximo_intento_at_idx"
    ON "webhook_entregas"("estado", "proximo_intento_at");

CREATE INDEX "webhook_entregas_created_at_idx" ON "webhook_entregas"("created_at");
