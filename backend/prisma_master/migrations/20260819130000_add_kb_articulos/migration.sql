-- La Ayuda pasa a ser ÚNICA y GLOBAL: `kb_articulos` nace en master.
--
-- POR QUÉ: hasta hoy los artículos vivían en la DB de cada cliente. El mismo
-- texto estaba duplicado tantas veces como tenants había, y publicarlo era una
-- acción por cliente. Como la Ayuda documenta CÓMO SE USA EL SISTEMA —y el
-- sistema es el mismo para todos—, esa duplicación no representaba ninguna
-- diferencia real: solo generaba deriva. Una sola tabla en master la elimina.
--
-- El DROP de la tabla equivalente en cada tenant va en la migración hermana
-- `prisma_tenant/migrations/20260819130000_drop_kb_articulos`. El orden de
-- deploy importa: PRIMERO esta (crear en master y correr `pnpm sync:ayuda`),
-- DESPUÉS la del tenant.
--
-- Copia el modelo del tenant MENOS `tipo_ticket_id` y su FK: apuntaba a
-- `tipos_ticket`, que es una tabla del TENANT. Cruzando a master la relación es
-- imposible, y un artículo global tampoco puede referenciar el catálogo de UN
-- cliente. La columna no se recrea acá.
--
-- `autor_id` queda como UUID suelto, SIN FK a `usuarios`: es la misma decisión
-- que ya tenía en el tenant (allá era cross-DB y no había alternativa; acá es
-- deliberada). El autor puede darse de baja sin arrastrar el artículo, y los
-- artículos que mantiene el repositorio no tienen persona detrás.

-- CreateTable
CREATE TABLE "kb_articulos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(120),
    "titulo" VARCHAR(255) NOT NULL,
    "contenido" TEXT NOT NULL,
    "autor_id" UUID,
    "visible_para_solicitante" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "kb_articulos_pkey" PRIMARY KEY ("id")
);

-- CheckConstraint (raw SQL — Prisma no expresa CHECK en el schema declarativo)
-- Formato kebab-case ASCII: minúsculas, dígitos y guiones simples, sin guion al
-- inicio ni al final. El slug viaja en URLs y en nombres de archivo; que la DB
-- lo garantice evita que una mayúscula o un espacio accidental en el
-- frontmatter genere dos identidades que el humano lee como la misma.
-- Se valida solo cuando NO es NULL: un artículo creado desde la aplicación no
-- tiene slug y queda exento.
ALTER TABLE "kb_articulos" ADD CONSTRAINT "kb_articulos_slug_formato_check" CHECK (
    "slug" IS NULL OR "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
);

-- CreateIndex
-- UNIQUE: dos artículos no pueden compartir slug — es la garantía que hace
-- determinista al sync (`scripts/sync-ayuda.js`). En Postgres un UNIQUE tolera
-- múltiples NULL, así que convive con los artículos sin slug sin necesidad de
-- un índice parcial.
CREATE UNIQUE INDEX "kb_articulos_slug_key" ON "kb_articulos"("slug");

-- CreateIndex
-- El listado sin `KB:VER_TODOS` filtra SIEMPRE por esta columna (solo
-- publicados), y es la lectura más frecuente del módulo.
CREATE INDEX "kb_articulos_visible_para_solicitante_idx" ON "kb_articulos"("visible_para_solicitante");
