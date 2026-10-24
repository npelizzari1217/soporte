# Preventivo: anticipación del ticket y recordatorio

El plan preventivo gana una anticipación (número + Días/Meses): el ticket se genera esa cantidad antes de
la fecha del ciclo, conserva esa fecha como fecha objetivo y el responsable recibe un recordatorio.

## Specs

- **S1** — "Al realizar un preventivo necesito agregar un campo que contenga un numero entero y otro campo
  de unidades (Dias, Meses), como los que ya tiene, pero estos son para indicar la cantidad de dias o meses
  anteriores a la fecha del preventivo proximo debe generar el ticket del preventivo, avisandole al
  responsable por correo para que no se olvide de hacerlo."
- **S2** — El ticket generado "Conserva la fecha objetivo": fecha objetivo = fecha del ciclo del plan.
  Campo nuevo del ticket, informativo, visible en detalle y listado; no cambia el SLA (L3).
- **S3** — Correo al responsable al generarse el ticket (ya existe el aviso; suma la fecha objetivo).
- **S4** — "quiero recordatorio cerca dela fecha": un recordatorio 1 día antes de la fecha objetivo, solo
  al responsable, solo si el ticket sigue abierto, una sola vez (L3).
- **S5** — Planes existentes: anticipación 0 días (comportamiento actual) (L3).
- **S6** — Validación (decisión técnica, L4): anticipación entera >= 0; debe ser menor que la cadencia
  (comparadas en días, mes = 30), si no se rechaza con un error que lo explica. Topes espejados en dominio,
  DTO y front.

## Tasks

- [ ] T1 — S1, S5, S6 — worker — campos de anticipación (migración, dominio, DTO, front) — (pendiente)
- [ ] T2 — S1, S2, S3 — worker — generación anticipada con fecha objetivo y correo con la fecha — (pendiente)
- [ ] T3 — S4 — worker — recordatorio 1 día antes, idempotente — (pendiente)

## Log

- **L1** (dueño, 2026-10-23) — pedido S1, textual.
- **L2** (dueño, 2026-10-24) — "Conserva la fecha objetivo, y quiero recordatorio cerca dela fecha".
- **L3** (decisiones del dueño, 2026-10-24) — recordatorio "1 día antes (recomendado)"; destinatarios
  "Solo el responsable (rec.)"; fecha objetivo "Detalle y listado (rec.)" (informativa, sin SLA); planes
  actuales "0 días (recomendado)".
- **L4** (evidencia, mapeo) — No existe fecha objetivo en `tickets` (`schema.prisma:277-338`). Plan:
  `intervaloValor`/`intervaloUnidad` (`plan-preventivo.entity.ts:23,138`), `proximaEjecucionEn @db.Date`.
  Cron diario 1am (`preventivo-sweep.scheduler.ts:44`), idempotencia `preventivo_generacion`
  UNIQUE(plan_id, fecha_programada). Aviso al generar ya existe (`preventivo-generado-notificacion.listener.ts:64`,
  `templatePreventivoGenerado`). Zona horaria fija Argentina; columnas `@db.Date` se leen en UTC.
