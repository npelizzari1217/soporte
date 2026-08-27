-- Mantenimiento preventivo programado (`preventivo`, sdd/preventivo WU-2).
--
-- `planes_preventivo`: cadencia declarada una vez, objetivo excluyente
-- (equipo XOR ubicación), responsable que oficia de solicitante del ticket
-- MANTENIMIENTO que genera el barrido. La AUTORIDAD del objetivo excluyente
-- es el dominio (`PlanPreventivoEntity.create()`, WU-3); el CHECK de abajo
-- es backstop (ADR-PV1, mismo criterio que CSAT).
--
-- `equipo_id`/`ubicacion` NULLABLE con CHECK
-- ((equipo_id IS NOT NULL) <> (ubicacion IS NOT NULL)): `<>` entre booleanos
-- ES el XOR de Postgres, y `IS NOT NULL` NUNCA devuelve NULL — el CHECK no
-- se evade por tri-valuación, rechaza los-dos y ninguno.
--
-- `intervalo_valor`/`intervalo_unidad` + `fecha_inicio`: la cadencia es un
-- desplazamiento fijo desde un ancla INMUTABLE. `proxima_ejecucion_en` es el
-- puntero que el barrido consulta (índice parcial) y avanza — SIEMPRE
-- derivado de `fecha_inicio + k×cadencia`, NUNCA de now() ni encadenado
-- desde el ciclo anterior (ADR-PV2: encadenar acumula deriva y rompe el fin
-- de mes — 31/01 + 1 MES = 28/02, pero k=2 debe ser 31/03, no 28/03).
--
-- `responsable_id`: soft ref → master.usuarios.id. SIN FK cross-DB (cada
-- tenant es una base física distinta) — mismo criterio que
-- tickets.solicitante_id.
--
-- `activo=false` (o soft delete) frena la generación de ciclos futuros sin
-- borrar lo ya generado.
--
-- `preventivo_generacion`: fila de auditoría de UN ciclo de UN plan. HARD
-- DELETE, SIN updated_at NI deleted_at — es un HECHO registrado, no una
-- opinión editable (mismo criterio que `reparacion_compra`).
--
-- `resultado`: catálogo cerrado de 4 códigos. 'RESERVADO' es TRANSITORIO —
-- existe solo mientras la transacción del ciclo está en vuelo (ADR-PV2); el
-- INSERT ON CONFLICT DO NOTHING que la crea es la PRIMERA sentencia de esa
-- transacción, cerrando la ventana de carrera de dos corridas concurrentes
-- del mismo ciclo. Nunca debe verse committeado.
--
-- `preventivo_generacion_plan_fecha_key` UNIQUE(plan_id, fecha_programada)
-- es la clave de idempotencia real (ADR-PV2). Su prefijo izquierdo (plan_id)
-- ya cubre el listado de generaciones por plan: NO se agrega índice suelto.
-- `preventivo_generacion_ticket_id_key` UNIQUE(ticket_id) es el backstop que
-- evita que un mismo ticket quede referenciado por dos filas — un UNIQUE de
-- Postgres admite múltiples NULL, así que las filas salteadas (sin ticket)
-- conviven sin problema.
--
-- CHECKs probados en el spec colocado
-- `backend/src/preventivo/infrastructure/persistence/prisma/preventivo-schema.integration.spec.ts`
-- (WU-2, tasks 2.5-2.7): un `it` por CHECK, contra el INSERT raw que lo
-- viola, no leyendo el DDL.

-- CreateTable
CREATE TABLE "planes_preventivo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "titulo" VARCHAR(255) NOT NULL,
    "instrucciones" TEXT,
    "equipo_id" UUID,
    "ubicacion" VARCHAR(255),
    "prioridad_id" UUID NOT NULL,
    "responsable_id" UUID NOT NULL,
    "intervalo_valor" INTEGER NOT NULL,
    "intervalo_unidad" VARCHAR(10) NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "proxima_ejecucion_en" DATE NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "planes_preventivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preventivo_generacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plan_id" UUID NOT NULL,
    "fecha_programada" DATE NOT NULL,
    "resultado" VARCHAR(24) NOT NULL,
    "ticket_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preventivo_generacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Parcial — exactamente la query del cron (findVencibles: activo AND deleted_at IS NULL).
CREATE INDEX "planes_preventivo_proxima_ejecucion_idx"
    ON "planes_preventivo"("proxima_ejecucion_en")
    WHERE "activo" AND "deleted_at" IS NULL;

-- CreateIndex
-- Parcial — planes de un equipo (ficha del equipo + baja del equipo).
CREATE INDEX "planes_preventivo_equipo_id_idx"
    ON "planes_preventivo"("equipo_id")
    WHERE "equipo_id" IS NOT NULL;

-- CreateIndex
-- Clave de idempotencia (ADR-PV2). Prefijo izquierdo (plan_id) cubre el
-- listado por plan: NO se agrega índice suelto sobre plan_id.
CREATE UNIQUE INDEX "preventivo_generacion_plan_fecha_key"
    ON "preventivo_generacion"("plan_id", "fecha_programada");

-- CreateIndex
-- Backstop: un ticket pertenece a lo sumo a una generación. Múltiples NULL
-- conviven (filas salteadas, sin ticket).
CREATE UNIQUE INDEX "preventivo_generacion_ticket_id_key"
    ON "preventivo_generacion"("ticket_id");

-- AddForeignKey
-- ON DELETE RESTRICT: borrar un equipo no debe llevarse en silencio el plan
-- que lo mantiene. En la práctica equipos_informaticos usa soft delete, así
-- que RESTRICT es un backstop, no el camino normal.
ALTER TABLE "planes_preventivo" ADD CONSTRAINT "planes_preventivo_equipo_id_fkey"
    FOREIGN KEY ("equipo_id") REFERENCES "equipos_informaticos"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes_preventivo" ADD CONSTRAINT "planes_preventivo_prioridad_id_fkey"
    FOREIGN KEY ("prioridad_id") REFERENCES "prioridades"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preventivo_generacion" ADD CONSTRAINT "preventivo_generacion_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "planes_preventivo"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preventivo_generacion" ADD CONSTRAINT "preventivo_generacion_ticket_id_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint (raw SQL — Prisma no expresa CHECK en el schema declarativo)

-- planes_preventivo: objetivo excluyente. `<>` entre booleanos es XOR real
-- de Postgres; IS NOT NULL nunca devuelve NULL, así que no hay tri-valuación
-- que evadir (ADR-PV1).
ALTER TABLE "planes_preventivo" ADD CONSTRAINT "planes_preventivo_objetivo_check" CHECK (
    ("equipo_id" IS NOT NULL) <> ("ubicacion" IS NOT NULL)
);

-- planes_preventivo: cadencia estrictamente positiva.
ALTER TABLE "planes_preventivo" ADD CONSTRAINT "planes_preventivo_intervalo_valor_check" CHECK (
    "intervalo_valor" > 0
);

-- planes_preventivo: catálogo cerrado de unidades de cadencia.
ALTER TABLE "planes_preventivo" ADD CONSTRAINT "planes_preventivo_intervalo_unidad_check" CHECK (
    "intervalo_unidad" IN ('DIAS', 'MESES')
);

-- preventivo_generacion: catálogo cerrado de 4 resultados posibles del ciclo.
ALTER TABLE "preventivo_generacion" ADD CONSTRAINT "preventivo_generacion_resultado_check" CHECK (
    "resultado" IN ('RESERVADO', 'GENERADO', 'SALTEADO_PENDIENTE', 'SALTEADO_ATRASO')
);

-- preventivo_generacion: coherencia — GENERADO tiene ticket, cualquier otro
-- resultado no lo tiene. `=` entre booleanos: ambos true o ambos false.
ALTER TABLE "preventivo_generacion" ADD CONSTRAINT "preventivo_generacion_ticket_coherencia_check" CHECK (
    ("resultado" = 'GENERADO') = ("ticket_id" IS NOT NULL)
);
