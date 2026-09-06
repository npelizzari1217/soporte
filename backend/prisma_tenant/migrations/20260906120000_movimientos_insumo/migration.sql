-- Unidad 1 de insumos-entrega-2: la bitácora de existencias.
-- Ref design: openspec/changes/insumos-entrega-2/design.md, decisiones 1 y 4.
--
-- Tabla APPEND-ONLY, calcada de `operaciones_compra` (20260813130000, ADR-C4):
-- sin `updated_at` y sin `deleted_at`. Un movimiento no se edita ni se borra;
-- se corrige con otro movimiento, que deja rastro de la corrección. Sin esas
-- dos columnas, el historial no se puede reescribir en silencio.
--
-- El stock de un insumo es la SUMA de sus movimientos, nunca una columna
-- mutable: una columna mutable admite dos verdades —el saldo y el historial— y
-- el día que discrepan no hay forma de saber cuál miente.
--
-- LÍMITE CONOCIDO, dicho y no escondido: Postgres no puede expresar
-- `SUM(cantidad) >= 0` sobre varias filas, así que esta migración NO trae
-- backstop contra el stock negativo. La invariante depende de que toda
-- escritura pase por el único punto que toma el advisory lock
-- (`pg_advisory_xact_lock`, unidad 3). Un segundo repositorio, o un INSERT
-- manual acá, la rompe sin que la base lo note. No se resuelve con un trigger:
-- no hay un solo trigger en las migraciones de este repo y estrenar ese patrón
-- acá sería introducir un mecanismo sin precedente para tapar un problema de
-- disciplina.
--
-- Sin seed: la tabla nace vacía.

CREATE TABLE "movimientos_insumo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "insumo_id" UUID NOT NULL,
    "tipo" VARCHAR(20) NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    -- Soft ref → master.usuarios.id, SIN FK cross-DB: cada inquilino es una
    -- base física distinta. Mismo criterio que `operaciones_compra.usuario_id`.
    "usuario_id" UUID NOT NULL,
    -- Obligatorio SOLO para el AJUSTE, y esa regla la hace cumplir el DOMINIO,
    -- no la base. Un CHECK condicional (`tipo <> 'AJUSTE' OR motivo IS NOT
    -- NULL`) sería un segundo dueño de una regla que ya vive en la entidad, y
    -- además no puede exigir un motivo con CONTENIDO —un espacio en blanco lo
    -- conformaría igual—, que es justo lo que interesa.
    "motivo" TEXT,
    -- A DÓNDE fue lo que salió. Los dos NULLABLE y solo trazabilidad: HAY UN
    -- SOLO STOCK, no uno por sector ni por equipo. Ninguna de las dos columnas
    -- participa de la suma — filtrar por ellas responde "qué se le puso a este
    -- equipo", nunca "cuánto hay en este sector".
    "equipo_id" UUID,
    "sector_id" UUID,
    -- SIN updated_at NI deleted_at: ver cabecera.
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "movimientos_insumo_pkey" PRIMARY KEY ("id"),
    -- Catálogo CERRADO, igual que `operaciones_compra_tipo_check`. La lista de
    -- acá y `TIPOS_MOVIMIENTO_INSUMO` (dominio) son la misma verdad escrita dos
    -- veces: el spec de constraints lee este CHECK con `pg_get_constraintdef` y
    -- las compara, para que agregar un tipo en TypeScript sin migración se vea
    -- en rojo y no como un 500.
    CONSTRAINT "movimientos_insumo_tipo_check" CHECK ("tipo" IN ('ENTRADA', 'SALIDA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO')),
    -- El SIGNO lo da el `tipo`, no el número. Sin este CHECK la misma salida se
    -- podría escribir de dos formas —SALIDA de 5 o ENTRADA de -5— y la suma del
    -- stock no sabría cuál es la buena. Cero tampoco: un movimiento de cero no
    -- mueve nada y solo ensucia la bitácora.
    CONSTRAINT "movimientos_insumo_cantidad_check" CHECK ("cantidad" > 0)
);

-- ON DELETE RESTRICT, NO CASCADE. Es el desvío deliberado respecto de
-- `insumos_codigos_alternativos_insumo_id_fkey`, que sí va en CASCADE: un
-- código alternativo es un atributo del insumo y sin él no significa nada,
-- mientras que un movimiento es un hecho contable —quién sacó qué, cuándo y por
-- qué— que sobrevive al catálogo. Borrar el insumo y llevarse su bitácora
-- destruiría en silencio justo lo que una tabla append-only existe para
-- conservar, y además borraría el stock, que ES esa suma. `insumos` tiene baja
-- lógica (`activo`, `deleted_at`): el camino correcto es desactivar, y RESTRICT
-- hace que el camino destructivo falle fuerte en vez de callarse. Mismo
-- criterio que `insumos_familia_id_fkey`.
ALTER TABLE "movimientos_insumo" ADD CONSTRAINT "movimientos_insumo_insumo_id_fkey"
    FOREIGN KEY ("insumo_id") REFERENCES "insumos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Trazabilidad: FK reales aunque nullables. Nullable NO es "sin FK" — un
-- `equipo_id` inventado tiene que rebotar, o el registro apuntaría a la nada.
-- RESTRICT por el mismo motivo que arriba: los dos catálogos tienen baja
-- lógica, y borrar un equipo no debe vaciar la trazabilidad de lo que se le
-- puso.
ALTER TABLE "movimientos_insumo" ADD CONSTRAINT "movimientos_insumo_equipo_id_fkey"
    FOREIGN KEY ("equipo_id") REFERENCES "equipos_informaticos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimientos_insumo" ADD CONSTRAINT "movimientos_insumo_sector_id_fkey"
    FOREIGN KEY ("sector_id") REFERENCES "sectores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El índice de la consulta de stock. Es compuesto y no simple porque sirve a
-- las dos consultas del módulo: la suma (`WHERE insumo_id = ?`, cubierta por el
-- prefijo) y la bitácora de la ficha, ordenada por fecha. Sin él, cada consulta
-- de stock recorre TODA la bitácora del inquilino.
CREATE INDEX "movimientos_insumo_insumo_id_created_at_idx"
    ON "movimientos_insumo"("insumo_id", "created_at");

-- Índices PARCIALES sobre las FK nullables — mismo patrón que
-- `equipos_informaticos_modelo_equipo_id_idx`. Sin índice, el RESTRICT de
-- arriba obliga a un seq scan de la bitácora entera cada vez que alguien borra
-- un equipo o un sector; parciales, indexan solo las filas que efectivamente
-- registran destino, que son la minoría.
CREATE INDEX "movimientos_insumo_equipo_id_idx"
    ON "movimientos_insumo"("equipo_id") WHERE "equipo_id" IS NOT NULL;
CREATE INDEX "movimientos_insumo_sector_id_idx"
    ON "movimientos_insumo"("sector_id") WHERE "sector_id" IS NOT NULL;
