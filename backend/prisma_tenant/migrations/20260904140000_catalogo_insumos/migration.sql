-- Entrega 1 de sdd/insumos-catalogo: catálogo de insumos y compatibilidad.
--
-- Tres catálogos (`modelos_equipo`, `familias_insumo`, `unidades_medida`), el
-- insumo con sus códigos alternativos, y la relación N:N que es el corazón del
-- módulo: la compatibilidad pertenece al MODELO de equipo, no a la instancia.
-- Un tóner sirve a quince impresoras y una impresora usa cuatro tóners; colgada
-- de la instancia habría que recargarla equipo por equipo.
--
-- Las existencias (`movimientos_insumo`) son la Entrega 2 y NO están acá.
--
-- Criterio de UNIQUE, calcado de `sectores` (20260817150000): sin índice parcial
-- por `deleted_at` — un código dado de baja NO se reutiliza.
--
-- Sin seed: los tres catálogos nacen vacíos y los llena el ADMINISTRADOR del
-- cliente desde el ABM, igual que `sectores`.

-- ─── Catálogo de modelos de equipo ──────────────────────────────────────────
CREATE TABLE "modelos_equipo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "marca" VARCHAR(100) NOT NULL,
    "modelo" VARCHAR(150) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "modelos_equipo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "modelos_equipo_marca_modelo_key" ON "modelos_equipo"("marca", "modelo");

-- ─── Catálogos de familia y unidad de medida ────────────────────────────────
--
-- Van como TABLA y no como CHECK porque el conjunto no está cerrado: agregar
-- una familia nueva no puede depender de un deploy. Las unidades son pocas y
-- cambian poco, pero van igual: partir el criterio entre dos catálogos hermanos
-- es la clase de asimetría que después nadie recuerda por qué existe.
CREATE TABLE "familias_insumo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "familias_insumo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "familias_insumo_codigo_key" ON "familias_insumo"("codigo");

CREATE TABLE "unidades_medida" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(50) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "unidades_medida_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "unidades_medida_codigo_key" ON "unidades_medida"("codigo");

-- ─── Insumo ─────────────────────────────────────────────────────────────────
CREATE TABLE "insumos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" VARCHAR(50) NOT NULL,
    "nombre" VARCHAR(255) NOT NULL,
    "familia_id" UUID NOT NULL,
    "unidad_medida_id" UUID NOT NULL,
    "stock_minimo" DECIMAL(10,2),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "insumos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "insumos_stock_minimo_check" CHECK ("stock_minimo" IS NULL OR "stock_minimo" >= 0)
);
CREATE UNIQUE INDEX "insumos_codigo_key" ON "insumos"("codigo");
CREATE INDEX "insumos_familia_id_idx" ON "insumos"("familia_id");
CREATE INDEX "insumos_unidad_medida_id_idx" ON "insumos"("unidad_medida_id");

-- ON DELETE RESTRICT, mismo criterio que `compras.sector_id`: borrar una familia
-- en uso no debe vaciar en silencio la clasificación de los insumos. El camino
-- correcto es desactivarla (`activo = false`).
ALTER TABLE "insumos" ADD CONSTRAINT "insumos_familia_id_fkey"
    FOREIGN KEY ("familia_id") REFERENCES "familias_insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "insumos" ADD CONSTRAINT "insumos_unidad_medida_id_fkey"
    FOREIGN KEY ("unidad_medida_id") REFERENCES "unidades_medida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Códigos alternativos (referencias cruzadas) ────────────────────────────
--
-- "CF226X", "26X" y el genérico compatible son el mismo insumo con tres
-- nombres. Sin esta tabla, el día que el proveedor ofrece el alternativo nadie
-- sabe que ya lo tenía comprado con otro código.
CREATE TABLE "insumos_codigos_alternativos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "insumo_id" UUID NOT NULL,
    "codigo" VARCHAR(50) NOT NULL,
    "fabricante" VARCHAR(100),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "insumos_codigos_alternativos_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "insumos_codigos_alternativos" ADD CONSTRAINT "insumos_codigos_alternativos_insumo_id_fkey"
    FOREIGN KEY ("insumo_id") REFERENCES "insumos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "insumos_codigos_alternativos_insumo_id_idx" ON "insumos_codigos_alternativos"("insumo_id");

-- `NULLS NOT DISTINCT` es el punto de este índice, no un detalle: por defecto
-- Postgres considera cada NULL distinto de cualquier otro, así que un UNIQUE
-- común dejaría cargar el mismo código genérico sin fabricante tantas veces
-- como se quiera — justo el duplicado que esta tabla existe para evitar.
-- Requiere Postgres 15+; producción corre 16.
CREATE UNIQUE INDEX "insumos_codigos_alternativos_codigo_fabricante_key"
    ON "insumos_codigos_alternativos"("codigo", "fabricante") NULLS NOT DISTINCT;

-- ─── Compatibilidad insumo ↔ modelo de equipo ───────────────────────────────
--
-- PK compuesta: un insumo aparece una sola vez por modelo. `rol` distingue el
-- lugar que ocupa (NEGRO, CIAN, MAGENTA, AMARILLO para una impresora color;
-- TAMBOR o FUSOR para otras piezas). SIN CHECK de conjunto cerrado a propósito:
-- el conjunto no está cerrado, mismo criterio que `familias_insumo`.
--
-- ON DELETE CASCADE en las dos puntas: esta tabla no tiene identidad propia, es
-- la relación misma. Si se borra el insumo o el modelo, la fila no significa
-- nada.
CREATE TABLE "insumos_modelos_equipo" (
    "insumo_id" UUID NOT NULL,
    "modelo_equipo_id" UUID NOT NULL,
    "rol" VARCHAR(20),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "insumos_modelos_equipo_pkey" PRIMARY KEY ("insumo_id", "modelo_equipo_id")
);
ALTER TABLE "insumos_modelos_equipo" ADD CONSTRAINT "insumos_modelos_equipo_insumo_id_fkey"
    FOREIGN KEY ("insumo_id") REFERENCES "insumos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insumos_modelos_equipo" ADD CONSTRAINT "insumos_modelos_equipo_modelo_equipo_id_fkey"
    FOREIGN KEY ("modelo_equipo_id") REFERENCES "modelos_equipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "insumos_modelos_equipo_modelo_equipo_id_idx" ON "insumos_modelos_equipo"("modelo_equipo_id");

-- ─── El equipo apunta a su modelo ───────────────────────────────────────────
--
-- NULLABLE a propósito: un clon armado en casa no tiene marca ni modelo y
-- existe igual — simplemente no participa de la compatibilidad. Convive con los
-- campos de texto libre `marca`/`modelo`, que siguen siendo la vía para un
-- equipo sin modelo de catálogo.
--
-- ON DELETE RESTRICT: borrar un modelo en uso no debe desvincular equipos en
-- silencio. Se desactiva, no se borra.
ALTER TABLE "equipos_informaticos" ADD COLUMN "modelo_equipo_id" UUID;
ALTER TABLE "equipos_informaticos" ADD CONSTRAINT "equipos_informaticos_modelo_equipo_id_fkey"
    FOREIGN KEY ("modelo_equipo_id") REFERENCES "modelos_equipo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "equipos_informaticos_modelo_equipo_id_idx"
    ON "equipos_informaticos"("modelo_equipo_id") WHERE "modelo_equipo_id" IS NOT NULL;
