-- sdd/formulario-publico-qr (WU-11, ADR-7): pedidos publicos pendientes de verificar.
-- Aditiva: tabla nueva. Aca vive la PII del pedido (nombre, email, telefono); en master solo queda
-- el hash del token, bajo el MISMO id (soft ref, sin FK cross-DB).
-- `equipo_id` ya viene resuelto desde el QR; si el equipo se borra fisicamente, el pedido sigue
-- valido sin equipo (ON DELETE SET NULL).
-- `expires_at`: creacion + 24 h (decision del dueño, aplicada en el dominio).
-- La fila se borra al confirmar (DELETE ... RETURNING) o al vencer: cada solicitud nueva purga los
-- vencidos de su tenant, sin scheduler. El indice sobre `expires_at` sirve a esa purga.
CREATE TABLE "pedidos_publicos_pendientes" (
  "id"          UUID          NOT NULL DEFAULT gen_random_uuid(),
  "nombre"      VARCHAR(120)  NOT NULL,
  "email"       VARCHAR(254)  NOT NULL,
  "telefono"    VARCHAR(30),
  "titulo"      VARCHAR(150)  NOT NULL,
  "descripcion" TEXT          NOT NULL,
  "equipo_id"   UUID,
  "expires_at"  TIMESTAMPTZ   NOT NULL,
  "created_at"  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT "pedidos_publicos_pendientes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pedidos_publicos_pendientes"
  ADD CONSTRAINT "pedidos_publicos_pendientes_equipo_id_fkey"
  FOREIGN KEY ("equipo_id") REFERENCES "equipos_informaticos" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "pedidos_publicos_pendientes_expires_at_idx"
  ON "pedidos_publicos_pendientes" ("expires_at");

CREATE INDEX "pedidos_publicos_pendientes_equipo_id_idx"
  ON "pedidos_publicos_pendientes" ("equipo_id") WHERE "equipo_id" IS NOT NULL;
