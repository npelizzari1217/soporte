-- Catálogo `respuestas_predefinidas` (roadmap segunda etapa, punto 4; issue #368).
--
-- Textos listos para insertar en el comentario de un ticket de soporte. Compartidas por
-- cliente (una tabla por tenant, no hay respuestas personales). Las gestiona el
-- ADMINISTRADOR del cliente desde Catálogos; sin seed: nace vacía.
--
-- `titulo` es único SIN distinguir mayúsculas (índice sobre lower(titulo)): "Saludo" y
-- "saludo" no pueden convivir. Incluye las desactivadas: reactivar una no debe chocar con
-- otra creada mientras tanto. Prisma no expresa índices funcionales; vive solo acá.
--
-- No se borra: se desactiva (`activo = false`) y deja de ofrecerse en el selector.
CREATE TABLE "respuestas_predefinidas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "titulo" VARCHAR(100) NOT NULL,
    "texto" VARCHAR(4000) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "respuestas_predefinidas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "respuestas_predefinidas_titulo_largo_chk"
        CHECK (char_length("titulo") BETWEEN 1 AND 100),
    CONSTRAINT "respuestas_predefinidas_texto_largo_chk"
        CHECK (char_length("texto") BETWEEN 1 AND 4000)
);
CREATE UNIQUE INDEX "respuestas_predefinidas_titulo_lower_key"
    ON "respuestas_predefinidas" (lower("titulo"));
