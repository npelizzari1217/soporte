-- Tabla `permisos_tipo_ticket` (odd/tasks/permisos-por-tipo-ticket.md, S1, D1, D4).
--
-- El tipo de ticket pasa a ser la unidad de permiso: una fila por terna (usuario, tipo, acción)
-- concedida, y "sin la acción" es la ausencia de fila. Vive en la base del tenant, junto a
-- `tipos_ticket`, porque la base master no puede referenciar los tipos. Sin seed: nace vacía; el
-- backfill que traduce la matriz master actual (S7) corre aparte, así que esta migración no
-- cambia el acceso de nadie.
--
-- `usuario_id` es referencia blanda a `master.usuarios` (sin FK: cross-DB, igual que
-- `tickets.solicitante_id`). Al borrar el tipo se borran sus permisos (CASCADE); la baja de un
-- tipo es lógica (`deleted_at`), así que las filas sobreviven y se reactivan con él.
--
-- El CHECK de `accion` enumera `ACCIONES_TIPO_TICKET` (`src/tickets/domain/permisos-tipo-ticket.ts`):
-- un test de integración compara las dos listas contra `pg_get_constraintdef`.
CREATE TABLE "permisos_tipo_ticket" (
    "usuario_id" UUID NOT NULL,
    "tipo_id" UUID NOT NULL,
    "accion" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "permisos_tipo_ticket_pkey" PRIMARY KEY ("usuario_id", "tipo_id", "accion"),
    CONSTRAINT "permisos_tipo_ticket_tipo_id_fkey" FOREIGN KEY ("tipo_id")
        REFERENCES "tipos_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "permisos_tipo_ticket_accion_check" CHECK ("accion" IN (
        'LECTURA', 'VER_TODOS', 'ALTAS', 'MODIFICACION', 'TRANSICIONAR',
        'ASIGNAR', 'COMENTAR', 'OBSERVAR', 'IMPRESION', 'BORRADO'
    ))
);

-- La PK ya empieza por `usuario_id`, pero el índice explícito deja documentada la lectura por
-- request (todas las filas de un usuario) y queda estable si la PK cambia de orden.
CREATE INDEX "permisos_tipo_ticket_usuario_id_idx" ON "permisos_tipo_ticket" ("usuario_id");
