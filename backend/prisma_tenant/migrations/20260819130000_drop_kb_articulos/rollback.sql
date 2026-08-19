-- Rollback de 20260819130000_drop_kb_articulos.
--
-- Recrea la tabla VACÍA, con el schema exacto que tenía al momento del DROP:
-- el de `init_tenant` más la columna `slug` que agregó
-- `20260819120000_kb_articulo_slug`. Los artículos NO vuelven — el DROP se los
-- llevó. Para repoblarla con los que mantiene el repositorio hay que correr un
-- sync apuntado al tenant, que en esta versión del código ya no existe (el
-- script sincroniza contra master); habría que restaurar desde backup.
--
-- Se recrea también la FK a `tipos_ticket`, porque el rollback tiene que
-- devolver la base al estado anterior, no a uno intermedio.

-- CreateTable
CREATE TABLE IF NOT EXISTS "kb_articulos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "titulo" VARCHAR(255) NOT NULL,
    "contenido" TEXT NOT NULL,
    "tipo_ticket_id" UUID,
    "autor_id" UUID,
    "visible_para_solicitante" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "slug" VARCHAR(120),

    CONSTRAINT "kb_articulos_pkey" PRIMARY KEY ("id")
);

-- CheckConstraint
ALTER TABLE "kb_articulos" ADD CONSTRAINT "kb_articulos_slug_formato_check" CHECK (
    "slug" IS NULL OR "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "kb_articulos_slug_key" ON "kb_articulos"("slug");
CREATE INDEX IF NOT EXISTS "kb_articulos_tipo_ticket_id_idx" ON "kb_articulos"("tipo_ticket_id");
CREATE INDEX IF NOT EXISTS "kb_articulos_visible_para_solicitante_idx" ON "kb_articulos"("visible_para_solicitante");

-- AddForeignKey
ALTER TABLE "kb_articulos" ADD CONSTRAINT "kb_articulos_tipo_ticket_id_fkey"
    FOREIGN KEY ("tipo_ticket_id") REFERENCES "tipos_ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
