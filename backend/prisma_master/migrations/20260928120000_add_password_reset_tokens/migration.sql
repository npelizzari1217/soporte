-- Tabla de tokens opacos de reseteo de contraseña por olvido
-- (sdd/reseteo-contrasena-olvidada, WU1).
--
-- Hermana de `encuesta_tokens`: token opaco de 32 bytes generado en la
-- aplicación, del que solo se persiste su SHA-256 (`token_hash`) — el token
-- crudo nunca se guarda.
--
-- A diferencia de `encuesta_tokens`, acá los dos extremos tienen FK real en
-- MASTER: `usuario_id` es el dueño del token (`ON DELETE CASCADE` — un token
-- no tiene valor sin su usuario) y `cliente_id` es el tenant que emitió el
-- token (la única membresía activa al momento de la solicitud), que la
-- confirmación reutiliza para el mail de aviso.
--
-- `expires_at`: emisión + 60 min (ADR-3 del design). `used_at`: objetivo del
-- CAS de uso único (ADR-5) — un
-- `UPDATE ... SET used_at = now() WHERE id = $1 AND used_at IS NULL AND
-- revoked_at IS NULL AND expires_at > now()` que afecta 0 filas si el link ya
-- se usó, está revocado o venció. `revoked_at`: revocación de los tokens
-- vigentes de un usuario al emitir uno nuevo (Req 4 de la spec).

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
-- `revocarVigentesDeUsuario` (WU2) busca todos los tokens vigentes de un
-- usuario por este campo, antes de generar uno nuevo.
CREATE INDEX "password_reset_tokens_usuario_id_idx" ON "password_reset_tokens"("usuario_id");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
