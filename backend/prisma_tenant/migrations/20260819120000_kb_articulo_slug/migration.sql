-- `slug`: clave estable y externa de un artículo de Ayuda.
--
-- POR QUÉ: los artículos de Ayuda pasan a mantenerse como archivos markdown
-- dentro del repositorio y se sincronizan a cada tenant (scripts/sync-ayuda.js).
-- Ese sync necesita una identidad para decidir "insertar" vs "actualizar", y
-- `titulo` NO sirve: es texto editorial que cambia. Sincronizar por título
-- convierte cada corrección de redacción en un artículo DUPLICADO en vez de
-- una actualización. `slug` es la identidad, `titulo` la presentación.
--
-- NULLABLE a propósito: los artículos ya cargados a mano por el cliente no
-- tienen slug y no se les inventa uno. En Postgres un índice UNIQUE tolera
-- múltiples NULL (dos NULL no se consideran iguales), así que la restricción
-- convive con esas filas sin necesidad de un índice parcial ni de un valor
-- centinela. Consecuencia buscada: una fila sin slug es, por definición, un
-- artículo del tenant y el sync no la toca nunca.
--
-- VARCHAR(120): un slug es un identificador legible corto ("permisos-y-roles").
-- El tope acota el índice y desalienta usarlo como si fuera un título.

-- AlterTable (expand)
ALTER TABLE "kb_articulos" ADD COLUMN "slug" VARCHAR(120);

-- CheckConstraint (raw SQL — Prisma no expresa CHECK en el schema declarativo)
-- Formato kebab-case ASCII: minúsculas, dígitos y guiones simples, sin guion
-- al inicio ni al final. El slug viaja en URLs y en nombres de archivo; que la
-- DB lo garantice evita que una mayúscula o un espacio accidental en el
-- frontmatter genere dos identidades que el humano lee como la misma.
-- Se valida solo cuando NO es NULL: las filas cargadas a mano quedan exentas.
ALTER TABLE "kb_articulos" ADD CONSTRAINT "kb_articulos_slug_formato_check" CHECK (
    "slug" IS NULL OR "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
);

-- CreateIndex
-- UNIQUE: dos artículos no pueden compartir slug — es la garantía que hace
-- determinista al sync. Sirve además como índice de búsqueda, que es
-- exactamente el acceso que hace el sync (uno por slug y por corrida).
CREATE UNIQUE INDEX "kb_articulos_slug_key" ON "kb_articulos"("slug");
