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

- [x] T1 — S1, S5, S6 — worker — campos de anticipación (migración, dominio, DTO, front) — (este commit)
- [x] T2 — S1, S2, S3 — worker — generación anticipada con fecha objetivo y correo con la fecha — (este commit)
- [x] T3 — S4 — worker — recordatorio 1 día antes, idempotente — (este commit)

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
- **L5** (decisión técnica, T1) — La regla "anticipación menor que la cadencia" vive en la entidad
  (`AnticipacionNoMenorQueCadenciaError`, mensaje con las dos magnitudes en días) y tiene CHECK espejo
  `planes_preventivo_anticipacion_menor_cadencia_check` con el mismo mes de 30 días; un test lee el CHECK
  y fija el 30. El DTO valida solo la forma (entero >= 0, unidad del catálogo) y no lleva `@Max`: ninguna
  anticipación válida supera la cadencia, así que el dominio corta antes del `int4`. El front copia
  `DIAS_POR_MES_ANTICIPACION` con test centinela. El alta sin anticipación toma 0 DIAS (S5).
- **L6** (decisión técnica, T1) — Editar la anticipación recalcula el puntero como la cadencia, pero por
  FECHA DE CICLO (primer ciclo > hoy), no por fecha de generación: con la segunda, agrandar la
  anticipación saltearía el próximo ciclo todavía no generado. Si ese ciclo ya cae en la ventana nueva,
  el barrido siguiente lo genera; si ya se había generado, `reservar()` lo descarta solo
  (`editar-plan.use-case.spec.ts`, caso 01/07 con 10 días).
- **L7** (decisión técnica, T2) — Fecha de generación = fecha del ciclo − anticipación, resta de
  calendario con clamp a fin de mes (`CalcularCicloService.fechaGeneracion`: 31/03 − 1 mes = 28/02).
  `ciclosPendientes` mide el vencimiento sobre esa fecha; candidato, `SALTEADO_ATRASO`, puntero y la clave
  `(plan_id, fecha_programada)` siguen siendo fechas de CICLO. `findVencibles` pasa a `$queryRaw` con
  `date - make_interval(months => n)`, que en Postgres hace el mismo clamp; dos integraciones fijan la
  equivalencia (10 vs 9 días; 27/02 vs 28/02). El re-anclaje por TOPE ignora la anticipación: deja el primer
  ciclo `>= hoy` y, si su generación ya venció, lo toma el barrido siguiente.
- **L8** (decisión técnica, T2) — `tickets.fecha_objetivo DATE NULL`, sin backfill, la fija solo el
  barrido con la fecha del ciclo (también con anticipación 0). Viaja en `TicketResponseDto` como el ISO de
  la medianoche UTC (detalle y listado comparten el mapper) y el front la muestra con
  `formatearFechaCalendario`. El correo de generación agrega "Fecha objetivo: dd/mm/aaaa" leyendo componentes
  UTC (`shared/domain/dia-calendario.ts`). No entra en el SLA ni en la exportación del listado (fuera de S2).
- **L9** (decisión técnica, T3) — El recordatorio lo corre el MISMO barrido diario, después de la generación
  de cada tenant y con su propio try/catch (`PREVENTIVO_RECORDATORIO_ERROR`): sin cron ni variable de
  entorno nuevos. "Mañana" es el día argentino (`diaArgentino`). Se reclama con un único
  `UPDATE tickets SET recordatorio_enviado_at = now() ... RETURNING` (columna nueva, índice parcial) en la
  misma transacción, y el evento `preventivo.recordatorio` sale por `alCommitear()`: una sola vez, a lo sumo
  (si el correo falla después del commit, se loguea y no se reintenta). Solo tickets enlazados por
  `preventivo_generacion`, vivos y fuera de RESUELTO/CERRADO/CANCELADO.
- **L10** (decisión técnica, T3) — Ventana exacta: `fecha_objetivo = mañana`. Si el barrido no corre la
  víspera, ese recordatorio se pierde (no se manda tarde). Un ticket generado HOY (desde las 00:00 ART) se
  saltea: ya recibió el correo de generación con la fecha objetivo; por eso con anticipación de 0 o 1 día no
  hay recordatorio.
- **L11** (decisión técnica, T3) — Destinatario: el responsable ACTUAL del plan, leído en el mismo `UPDATE`
  (JOIN con `planes_preventivo`), no el solicitante guardado en el ticket ni su asignado. Si el plan cambió
  de responsable después de generar, avisa al nuevo, que es quien responde por el mantenimiento. Nunca a
  los administradores (L3).
- **L12** (orquestador, 2026-10-24) — T1, T2 y T3 se commitean juntos: comparten `schema.prisma`,
  `ticket.mapper(.spec).ts`, plantillas, listener y diálogos, y separar por fragmentos dejaba commits
  intermedios que no compilan. Ayuda `mantenimiento-preventivo.md` corregida en el mismo commit.
- **L13** (verify independiente sobre 602a258e, 2026-10-24) — PASS sin bloqueantes. Ajustes del mismo
  commit siguiente: Ayuda aclara que no hay recordatorio si el ticket se generó ese mismo día; tests de
  `fechaGeneracion` en bordes (fin de mes, bisiesto, 0 días), dos barridos de recordatorio concurrentes y
  2 meses contra 59/60 días; comentario de `AnticipacionNoMenorQueCadenciaError` corregido (con unidades
  mezcladas el mes de 30 días es una aproximación).
