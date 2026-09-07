-- Unidad 1 de insumos-entrega-3: el enlace entre el circuito de compras y el
-- catálogo de insumos.
-- Ref design: openspec/changes/insumos-entrega-3/design.md, decisiones 2 y 6.
--
-- Dos columnas, una en cada dirección:
--   * `items_compra.insumo_id`  — de qué insumo se trata lo que se compra.
--     Sin ella, `descripcion` es texto libre y recibir la compra no sabe a qué
--     insumo imputarle la entrada de stock.
--   * `movimientos_insumo.item_compra_id` — de dónde vino lo que entró. Sin
--     ella, "¿de qué compra vino esta entrada?" no tiene respuesta.
--
-- LAS DOS SON NULLABLE Y NO HAY BACKFILL, y eso es una decisión, no una
-- omisión. Los ítems de compra anteriores a esta migración son texto libre y no
-- hay forma confiable de mapearlos al catálogo; backfillear uno con
-- `cantidad_recibida > 0` abriría además la pregunta de fabricar movimientos
-- retroactivos con fecha falsa, que sería inventar historia contable. Quedan en
-- NULL para siempre y la recepción de esos ítems funciona igual que hoy.
--
-- AGREGAR UNA COLUMNA A `movimientos_insumo` NO CONTRADICE SU APPEND-ONLY. Es
-- la duda que va a tener quien lea esto: la tabla se creó append-only a
-- propósito (20260906120000, sin `updated_at` ni `deleted_at`), y append-only
-- prohíbe el UPDATE y el DELETE de FILAS — reescribir un hecho ya asentado—,
-- no el `ALTER TABLE ADD COLUMN` nullable, que no toca ninguna fila existente
-- ni cambia lo que dice. Las filas viejas siguen diciendo exactamente lo mismo
-- que decían, con un origen desconocido explícito.
--
-- UNA SOLA columna hacia compras en la bitácora, y no también `compra_id`:
-- `items_compra` ya tiene `items_compra_compra_id_idx` y la compra se resuelve
-- con un join. Una segunda columna sería un segundo dueño del mismo dato, y el
-- día que discrepen no hay forma de saber cuál miente.
--
-- SIN CHECK. Se evaluaron dos y se descartaron los dos, con el mismo criterio
-- que `movimientos_insumo.motivo`:
--   * "un movimiento con `item_compra_id` tiene que ser de tipo ENTRADA" sería
--     un segundo dueño de una regla de la aplicación, y además cerraría hoy la
--     puerta a una devolución al proveedor, que sería una SALIDA con el mismo
--     origen.
--   * "el insumo del movimiento tiene que ser el del ítem que lo originó" sí es
--     expresable —UNIQUE (id, insumo_id) en `items_compra` más una FK
--     compuesta—, pero exigiría que todo ítem referenciado tenga insumo y
--     estrenaría un patrón sin precedente en este repo para sostener una regla
--     que el dominio ya hace cumplir (design, decisión 5: reasignar el insumo
--     de un ítem con recepciones se prohíbe en la entidad).

ALTER TABLE "items_compra" ADD COLUMN "insumo_id" UUID;

ALTER TABLE "movimientos_insumo" ADD COLUMN "item_compra_id" UUID;

-- ON DELETE RESTRICT en las dos, NO el SET NULL que Postgres tampoco pone por
-- default pero que Prisma SÍ asume para una relación opcional: el `onDelete:
-- Restrict` va escrito EXPLÍCITO en `schema.prisma` para que el próximo
-- `migrate dev` no regenere estas FK vaciando el vínculo en silencio. Es un
-- defecto que ya apareció en la Entrega 2 y por eso está dicho dos veces.
--
-- RESTRICT y no CASCADE porque los dos lados son hechos que sobreviven al
-- catálogo: borrar un insumo no debe llevarse los ítems de compra que lo
-- pidieron, ni borrar un ítem debe borrar el movimiento de stock que ya cuenta
-- para el saldo. Los dos padres tienen baja lógica (`activo`, `deleted_at`): el
-- camino correcto es desactivar, y RESTRICT hace que el camino destructivo
-- falle fuerte en vez de callarse. Mismo criterio que
-- `movimientos_insumo_insumo_id_fkey`.
--
-- Se desvía a propósito de `operaciones_compra_item_compra_id_fkey`, que sí va
-- en SET NULL: esa columna es NULL cuando la operación es de cabecera, así que
-- vaciarla la deja en un estado que ya significa algo. Acá no: un movimiento
-- sin `item_compra_id` significa "entrada manual", y convertir en manual una
-- entrada que vino de una compra sería falsear la trazabilidad.
ALTER TABLE "items_compra" ADD CONSTRAINT "items_compra_insumo_id_fkey"
    FOREIGN KEY ("insumo_id") REFERENCES "insumos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "movimientos_insumo" ADD CONSTRAINT "movimientos_insumo_item_compra_id_fkey"
    FOREIGN KEY ("item_compra_id") REFERENCES "items_compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Índices PARCIALES sobre las dos FK nullables — mismo patrón y mismo motivo
-- que `movimientos_insumo_equipo_id_idx` y `equipos_informaticos_modelo_equipo_id_idx`.
--
-- Hacen falta por dos consultas cada uno, no por una sola:
--   * la de negocio — "los ítems de compra de este insumo" y "los movimientos
--     de este ítem de compra";
--   * la que el RESTRICT de arriba obliga en CADA borrado del padre. Sin
--     índice, Postgres resuelve esa verificación con un seq scan de la tabla
--     hija entera, y la bitácora de existencias es la tabla que más crece del
--     inquilino.
--
-- PARCIALES porque en las dos columnas el NULL es mayoría permanente y ninguna
-- consulta lo busca: los ítems históricos quedan sin insumo para siempre, y en
-- la bitácora solo las entradas por recepción llevan origen —las salidas, los
-- ajustes y las entradas manuales, no—. Un índice completo indexaría esas filas
-- para nada y las cobraría en cada escritura. `WHERE ... IS NOT NULL` también
-- deja el índice utilizable por la verificación de la FK, que solo consulta
-- valores no nulos.
CREATE INDEX "items_compra_insumo_id_idx"
    ON "items_compra"("insumo_id") WHERE "insumo_id" IS NOT NULL;

CREATE INDEX "movimientos_insumo_item_compra_id_idx"
    ON "movimientos_insumo"("item_compra_id") WHERE "item_compra_id" IS NOT NULL;
