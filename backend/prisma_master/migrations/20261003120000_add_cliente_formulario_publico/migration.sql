-- Formulario publico por cliente (sdd/formulario-publico-qr, WU-1).
--
-- Aditiva: cuatro columnas nuevas en `clientes`, sin backfill.
--   * slug: identifica al cliente en la URL publica. UNIQUE, nullable (un
--     cliente sin slug no tiene URL publica). Los NULL no chocan entre si.
--   * formulario_publico_habilitado: default false (D12). Todo cliente,
--     nuevo o existente, nace con el formulario apagado.
--   * slug_congelado_at: marca de congelamiento. Se setea al emitir el primer
--     QR de cualquier equipo del cliente (ADR-2); desde entonces el slug no
--     cambia.
-- El CHECK de formato espeja SLUG_REGEX (clientes/domain/value-objects/
-- slug-cliente.ts), que es la fuente. La regla "no UUID / no id / no dbName"
-- vive solo en el dominio: Postgres no conoce el dbName normalizado.
ALTER TABLE "clientes"
  ADD COLUMN "slug" VARCHAR(63),
  ADD COLUMN "formulario_publico_habilitado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "slug_congelado_at" TIMESTAMPTZ;

CREATE UNIQUE INDEX "clientes_slug_key" ON "clientes"("slug");

ALTER TABLE "clientes"
  ADD CONSTRAINT "clientes_slug_formato_check"
  CHECK ("slug" IS NULL OR "slug" ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$');
