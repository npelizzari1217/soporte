-- sdd/formulario-publico-qr (WU-6, ADR-6 paso 1): solicitantes externos, locales al tenant.
-- Aditiva: crea una tabla nueva y no toca `tickets` (el vinculo y el CHECK llegan en la WU-7).
-- Una fila por pedido confirmado, sin deduplicar por email (D2). No hay Usuario ni Membresia.
-- Retencion (D11): los datos se conservan mientras exista el ticket que los referencia; no hay
-- borrado ni anonimizacion en esta entrega. Punto a revisar: politica de retencion de datos personales.
CREATE TABLE "solicitantes_externos" (
  "id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
  "nombre"              VARCHAR(120) NOT NULL,
  "email"               VARCHAR(254) NOT NULL,
  "telefono"            VARCHAR(30),
  "email_verificado_at" TIMESTAMPTZ  NOT NULL,
  "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "solicitantes_externos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "solicitantes_externos_email_idx" ON "solicitantes_externos" ("email");
