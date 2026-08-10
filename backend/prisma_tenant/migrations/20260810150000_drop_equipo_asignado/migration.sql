-- Los equipos ya no se asignan a personas (asignacion vive solo en tickets).
-- Columna nullable sin FK -> drop seguro; el codigo nuevo ya no la referencia.

-- DropIndex
DROP INDEX "equipos_informaticos_asignado_a_id_idx";

-- AlterTable
ALTER TABLE "equipos_informaticos" DROP COLUMN "asignado_a_id";
