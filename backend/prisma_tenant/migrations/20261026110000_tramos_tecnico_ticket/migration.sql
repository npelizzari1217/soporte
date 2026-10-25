-- Tramos del técnico en cada ticket (odd/tasks/tiempo-tecnico.md, T3, S4-S7, diseño L9).
--
-- Un tramo es el período en que un técnico tuvo el ticket: se abre cuando el ticket queda con un
-- asignado (alta con regla, asignación manual, asignar y poner en proceso, asignación por tareas,
-- o reapertura de un RESUELTO/CERRADO/CANCELADO con asignado) y se cierra cuando cambia el
-- asignado, se desasigna, o el ticket pasa a RESUELTO, CERRADO o CANCELADO. Lo escribe un solo
-- punto del código, en la misma transacción que guarda el ticket.
--
-- Al cerrar se fijan `habil_s` (segundos hábiles en el horario del técnico, menos las esperas al
-- cliente), `meta_s` (`tickets.sla_meta_s` en ese momento) y `cumplido`, que solo existe en el
-- tramo que cierra en RESUELTO con meta y medición (S6). El dominio es la autoridad; los CHECK
-- son el respaldo:
-- - `motivo_fin` es una de las cinco causas de cierre, espejo de `MOTIVOS_FIN_TRAMO` en
--   `src/tiempo-tecnico/domain/tramo-tecnico.ts` (un spec de integración compara los dos);
-- - un tramo abierto no tiene motivo ni medición, y uno cerrado siempre tiene motivo;
-- - `cumplido` es exactamente `habil_s <= meta_s` cuando el motivo es RESUELTO y hay meta y
--   medición, y NULL en cualquier otro caso. `habil_s` puede quedar NULL en un tramo cerrado si la
--   medición falló (el cierre no bloquea el cambio del ticket).
--
-- A lo sumo UN tramo abierto por ticket: índice único parcial `WHERE fin_at IS NULL`.
--
-- `tecnico_id` es referencia blanda a `master.usuarios` (sin FK, igual que
-- `tickets.asignado_id`). `ticket_id` va con ON DELETE CASCADE: el tramo es un dato derivado del
-- ticket, y los tickets solo se borran de forma lógica; el borrado físico (limpieza de tests) no
-- debe trabarse por un tramo.
--
-- Sin backfill (fuera de alcance del documento): la tabla nace vacía y se mide desde el deploy.
--
-- `updated_at` no tiene DEFAULT, igual que el resto de las tablas del tenant: lo escribe el código.
--
-- Re-ejecutable: CREATE TABLE / INDEX IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS "tramos_tecnico_ticket" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id"   UUID NOT NULL,
    "tecnico_id"  UUID NOT NULL,
    "inicio_at"   TIMESTAMPTZ NOT NULL,
    "fin_at"      TIMESTAMPTZ,
    "motivo_fin"  VARCHAR(20),
    "habil_s"     INTEGER,
    "meta_s"      INTEGER,
    "cumplido"    BOOLEAN,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tramos_tecnico_ticket_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tramos_tecnico_ticket_ticket_id_fkey"
      FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tramos_tecnico_ticket_fin_check"
      CHECK ("fin_at" IS NULL OR "fin_at" >= "inicio_at"),
    CONSTRAINT "tramos_tecnico_ticket_motivo_fin_check"
      CHECK ("motivo_fin" IN ('REASIGNADO', 'DESASIGNADO', 'RESUELTO', 'CERRADO', 'CANCELADO')),
    CONSTRAINT "tramos_tecnico_ticket_cierre_check" CHECK (
      ("fin_at" IS NULL AND "motivo_fin" IS NULL AND "habil_s" IS NULL AND "meta_s" IS NULL)
      OR ("fin_at" IS NOT NULL AND "motivo_fin" IS NOT NULL)
    ),
    CONSTRAINT "tramos_tecnico_ticket_habil_s_check"
      CHECK ("habil_s" IS NULL OR "habil_s" >= 0),
    CONSTRAINT "tramos_tecnico_ticket_meta_s_check"
      CHECK ("meta_s" IS NULL OR "meta_s" >= 0),
    CONSTRAINT "tramos_tecnico_ticket_cumplido_check" CHECK (
      "cumplido" IS NOT DISTINCT FROM (
        CASE
          WHEN "motivo_fin" = 'RESUELTO' AND "habil_s" IS NOT NULL AND "meta_s" IS NOT NULL
            THEN "habil_s" <= "meta_s"
        END
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "tramos_tecnico_ticket_abierto_key"
    ON "tramos_tecnico_ticket" ("ticket_id") WHERE "fin_at" IS NULL;

CREATE INDEX IF NOT EXISTS "tramos_tecnico_ticket_ticket_id_inicio_at_idx"
    ON "tramos_tecnico_ticket" ("ticket_id", "inicio_at");

CREATE INDEX IF NOT EXISTS "tramos_tecnico_ticket_tecnico_id_fin_at_idx"
    ON "tramos_tecnico_ticket" ("tecnico_id", "fin_at");
