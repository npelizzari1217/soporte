-- M2 — compras-tres-etapas-y-sectores (WU-17). PUNTO DE NO RETORNO del deploy
-- (design ADR-T9): `pnpm run migrate:tenants` y el restart del backend son UN
-- solo paso, en ese orden, sin nada en el medio — entre esos dos momentos el
-- código viejo consulta `cantidad_comprada`, que esta migración renombra.
--
-- Auditoría previa OBLIGATORIA contra CADA tenant real (design-parte2 §5)
-- ANTES de aplicar esto en producción. Localmente corre contra
-- soporte_tenant_test, que es el flujo normal de TDD del repo.

-- 1 · columnas nuevas, todavía SIN CHECK.
ALTER TABLE "items_compra" ADD COLUMN "cantidad_ordenada" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "items_compra" ADD COLUMN "fecha_orden"     DATE;
ALTER TABLE "items_compra" ADD COLUMN "fecha_recepcion" DATE;
ALTER TABLE "items_compra" ADD COLUMN "fecha_entrega"   DATE;

-- 2 · backfill conservador (R12, S70): lo ordenado es al menos lo que llegó.
--     Las 3 fechas quedan NULL a propósito (S52): no hay dato histórico y no se inventa.
UPDATE "items_compra" SET "cantidad_ordenada" = "cantidad_comprada";

-- 3 · RENAME. Postgres reescribe las expresiones dependientes (el CHECK viejo
--     pasa a decir "cantidad_recibida"), pero NO renombra el constraint: sigue
--     llamándose items_compra_cantidad_comprada_check. Por eso el DROP
--     explícito de abajo.
ALTER TABLE "items_compra" RENAME COLUMN "cantidad_comprada" TO "cantidad_recibida";
ALTER TABLE "items_compra" DROP CONSTRAINT "items_compra_cantidad_comprada_check";

-- 4 · CHECKs de cantidad, NOT VALID + VALIDATE separados (lock: SHARE UPDATE
--     EXCLUSIVE en vez de ACCESS EXCLUSIVE — no bloquea lecturas mientras
--     escanea). Prisma envuelve la migración en UNA transacción: si el
--     VALIDATE falla, hace rollback COMPLETO igual (S71) — el beneficio real
--     de partirlo es el lock, no el fallo parcial.
ALTER TABLE "items_compra" ADD CONSTRAINT "items_compra_cantidad_ordenada_check"
    CHECK ("cantidad_ordenada" >= 0 AND "cantidad_ordenada" <= "cantidad") NOT VALID;
ALTER TABLE "items_compra" VALIDATE CONSTRAINT "items_compra_cantidad_ordenada_check";

ALTER TABLE "items_compra" ADD CONSTRAINT "items_compra_cantidad_recibida_check"
    CHECK ("cantidad_recibida" >= 0 AND "cantidad_recibida" <= "cantidad_ordenada") NOT VALID;
ALTER TABLE "items_compra" VALIDATE CONSTRAINT "items_compra_cantidad_recibida_check";

ALTER TABLE "items_compra" DROP CONSTRAINT "items_compra_cantidad_entregada_check";
ALTER TABLE "items_compra" ADD CONSTRAINT "items_compra_cantidad_entregada_check"
    CHECK ("cantidad_entregada" >= 0 AND "cantidad_entregada" <= "cantidad_recibida") NOT VALID;
ALTER TABLE "items_compra" VALIDATE CONSTRAINT "items_compra_cantidad_entregada_check";

-- 5 · CHECK de orden cronológico (ADR-T3, resoluciones-pre-apply: acepta
--     como alcance agregado, backstop del invariante que valida el dominio).
--     Sin NOT VALID: toda fila preexistente tiene las 3 fechas en NULL.
--     Los TRES pares explícitos — con solo 2 queda un agujero transitivo
--     cuando la fecha del medio es NULL.
ALTER TABLE "items_compra" ADD CONSTRAINT "items_compra_fechas_orden_check" CHECK (
    ("fecha_orden"     IS NULL OR "fecha_recepcion" IS NULL OR "fecha_orden"     <= "fecha_recepcion")
AND ("fecha_recepcion" IS NULL OR "fecha_entrega"   IS NULL OR "fecha_recepcion" <= "fecha_entrega")
AND ("fecha_orden"     IS NULL OR "fecha_entrega"   IS NULL OR "fecha_orden"     <= "fecha_entrega")
);

-- 6 · bitácora: 12 valores (11 vigentes + 1 legacy COMPRA_REGISTRADA — ADR-T11).
ALTER TABLE "operaciones_compra" DROP CONSTRAINT "operaciones_compra_tipo_check";
ALTER TABLE "operaciones_compra" ADD CONSTRAINT "operaciones_compra_tipo_check" CHECK ("tipo" IN (
    'CREACION',
    'ITEM_AGREGADO',
    'ITEM_EDITADO',
    'ITEM_ELIMINADO',
    'ITEM_APROBADO',
    'ITEM_RECHAZADO',
    'ORDEN_REGISTRADA',
    'RECEPCION_REGISTRADA',
    'ENTREGA_REGISTRADA',
    'ITEM_CERRADO_CON_FALTANTE',
    'CANCELACION',
    'COMPRA_REGISTRADA'
));
