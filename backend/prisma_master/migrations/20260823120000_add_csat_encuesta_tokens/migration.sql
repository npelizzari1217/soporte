-- Tabla de tokens opacos de encuesta CSAT (sdd/csat, WU1).
--
-- Hermana de `refresh_tokens`: token opaco de 32 bytes generado en la
-- aplicación (WU6), del que solo se persiste su SHA-256 (`token_hash`) — el
-- token crudo nunca se guarda. Vive en MASTER porque
-- `ResolverEncuestaTokenService` (ADR-C1, sdd/csat/design) necesita leer
-- `cliente_id` ANTES de abrir el `TenantContext` del tenant correspondiente
-- — el mismo motivo por el que `refresh_tokens` vive acá y no en cada tenant.
--
-- `ticket_id` es soft ref al tenant (`tickets.id`): SIN FK cross-DB, MASTER
-- no puede referenciar una tabla que vive en otra base física.
--
-- `expires_at`: emisión + 30 días (aplicado en la capa de aplicación, WU6).
-- `used_at`: objetivo del CAS de uso único (ADR-C2, WU5) — un
-- `UPDATE ... SET used_at = now() WHERE id = $1 AND used_at IS NULL` que
-- afecta 0 filas si el link ya se usó. NULL = no usado.
-- `revoked_at`: revocación idempotente de tokens previos al reabrir un
-- ticket y volver a cerrarlo (WU6) — NULL = vigente.

-- CreateTable
CREATE TABLE "encuesta_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cliente_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "encuesta_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "encuesta_tokens_token_hash_key" ON "encuesta_tokens"("token_hash");

-- CreateIndex
-- La revocación en la emisión (ADR-C2, WU6) busca todos los tokens vigentes
-- de un ticket por este par, antes de generar uno nuevo.
CREATE INDEX "encuesta_tokens_cliente_id_ticket_id_idx" ON "encuesta_tokens"("cliente_id", "ticket_id");

-- AddForeignKey
ALTER TABLE "encuesta_tokens" ADD CONSTRAINT "encuesta_tokens_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
