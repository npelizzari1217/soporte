-- sdd/sla-habil WU-3: discriminador de cohortes para el cálculo de SLA.
--
-- Decisión de producto (dueño del repo): los tickets EXISTENTES no se
-- recalculan al introducir el cálculo sobre horas hábiles (WU-1/WU-2) — su
-- sla_vence_at queda con la regla vieja de horas corridas 24/7. Sin esta
-- columna, AplicarSlaUseCase.alReprioritizar (que recalcula desde el
-- created_at ORIGINAL cada vez que cambia la prioridad) recalcularía un
-- ticket viejo con la regla nueva la primera vez que alguien lo repriorice
-- — la fuga que esta migración tapa. RESUELTO no es estado terminal (solo
-- CERRADO y CANCELADO lo son), así que hasta un ticket resuelto entra por
-- ese camino.
--
-- Patrón expand/backfill, SIN código de aplicación: el primer ALTER agrega
-- la columna NOT NULL con DEFAULT 'CORRIDO' — Postgres backfillea ese valor
-- en TODAS las filas existentes de un solo saque. El segundo ALTER cambia
-- el DEFAULT a 'HABIL'. OJO: en el camino de la aplicación ese DEFAULT no
-- llega a actuar — Prisma resuelve el @default("HABIL") del schema del lado
-- del cliente y lo manda dentro del INSERT. Son DOS fuentes espejadas, y
-- mover la cohorte de los tickets nuevos exige tocar las dos. Ver el
-- docstring de SlaRegla en tickets/domain/entities/ticket.entity.ts.
-- AplicarSlaUseCase (WU-3) lee esta columna para elegir el calculador —
-- nunca la escribe.
ALTER TABLE "tickets" ADD COLUMN "sla_regla" VARCHAR(16) NOT NULL DEFAULT 'CORRIDO';

-- tickets: catálogo cerrado de las dos cohortes de cálculo de SLA.
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_sla_regla_check" CHECK (
    "sla_regla" IN ('CORRIDO', 'HABIL')
);

ALTER TABLE "tickets" ALTER COLUMN "sla_regla" SET DEFAULT 'HABIL';
