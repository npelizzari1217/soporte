-- CONTRACT destructivo — correr SOLO tras backfill validado (cero nulls) en
-- TODOS los tenants; ver scripts/backfill-tipos-componente-codigo.js.
-- Punto de no retorno: requiere backup por-tenant.
--
-- Cierra la fase expand/contract de PR4a→PR4b (sdd/tipos-componente-master):
-- 1) "tipo_componente_codigo" pasa a NOT NULL (ya poblada por el backfill).
-- 2) Se dropea la FK tenant "componentes_equipo_tipo_componente_id_fkey"
--    (nombre confirmado en prisma_tenant/migrations/20260805194710_init_tenant/migration.sql).
-- 3) Se dropea la columna "tipo_componente_id" (reemplazada por el código).
-- 4) Se dropea la tabla "tipos_componente" (catálogo tenant, ahora GLOBAL en
--    master.tipos_componente).

-- AlterTable (contract)
ALTER TABLE "componentes_equipo" ALTER COLUMN "tipo_componente_codigo" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "componentes_equipo" DROP CONSTRAINT "componentes_equipo_tipo_componente_id_fkey";

-- AlterTable (contract)
ALTER TABLE "componentes_equipo" DROP COLUMN "tipo_componente_id";

-- DropTable
DROP TABLE "tipos_componente";
