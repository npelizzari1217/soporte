# Promedios del dashboard en horas hábiles y guardados (2026-10-15)

## Objetivo
Que el dashboard deje de recorrer todo el historial en cada carga: el tiempo de resolución y el de
primera respuesta se guardan por ticket, en segundos hábiles, y se promedian con `AVG` en SQL. Salda
la fila "Los tiempos medios del dashboard recorren todo el historial en cada consulta" de "Deuda
técnica conocida" (`docs/roadmap-comercial.md`).

## Problema y porqué
- `tiempoPromedioResolucionHoras` (`backend/src/dashboard/infrastructure/persistence/prisma/prisma-dashboard.repository.ts:81-98`)
  trae todos los tickets cerrados y promedia en memoria **horas corridas** `fecha_cierre - created_at`:
  sin calendario, sin pausas y sin excluir preventivos. Como `fecha_cierre` se pisa al pasar a
  CERRADO, mide creación → CERRADO. La fila del roadmap decía "horas hábiles": estaba mal.
- `tiempoPromedioPrimeraRespuestaHoras` (`:187-209`) calcula horas hábiles en memoria con el
  calendario **actual**: cambiar el horario o los feriados recalcula todo el historial.

## Decisión del dueño (2026-10-15)
- **Resolución = tiempo hábil sin pausas**: el reloj del SLA (`sla_acumulado_s`), tomado cuando el
  ticket llega a RESUELTO (no a CERRADO). Al reabrir se borra y se toma de nuevo en el próximo
  RESUELTO.
- **Primera respuesta**: horas hábiles, calculadas una vez al registrarse.
- Cada valor queda **fijo con el calendario vigente al guardarse**.
- Diseño aprobado tal como se propuso: columnas nuevas, escritura en un solo punto, backfill del
  historial (SQL donde hay reloj, script donde no), preventivos fuera del promedio de resolución,
  etiqueta "horas hábiles, sin pausas".
- El efecto visible: el promedio de resolución baja (deja de contar noches, fines de semana y
  esperas del cliente).

## Hechos del código (exploración del 2026-10-15)
- El último tramo del reloj se pliega **después** del commit que llega a RESUELTO:
  `reloj-sla.listener.ts:21-28` → `ConsolidarRelojSlaUseCase` → `RelojSla.plegar`
  (`reloj-sla.ts:104-106`) → `PrismaRelojSlaRepository.guardarSiVersion`
  (`prisma-reloj-sla.repository.ts:114-142`), único escritor de las columnas del reloj (también lo
  usa `AplicarSla`). Si el listener falla, el barrido de 5 min (`marcar-vencidos.use-case.ts:58-64`)
  reconcilia.
- RESUELTO → CERRADO no toca el reloj. La reapertura correctiva (a NUEVO, ASIGNADO o EN_PROCESO)
  reanuda el reloj sin reiniciar el acumulado.
- Los tickets creados antes de `20261007130000_tickets_reloj_sla` (2026-10-07) tienen
  `sla_acumulado_s` NULL y, cerrados, casi nunca se incorporan. ESPERANDO_CLIENTE nació una hora
  antes (`20261007120000_estado_esperando_cliente`): esos tickets no tienen pausas.
- `sla_regla` es NOT NULL; los tickets anteriores al 2026-09-09 son CORRIDO (reloj 24/7 menos
  pausas), los nuevos HABIL.
- El reloj acumula aunque no haya meta (preventivos, `slaActivo=false`).
- `CalcularSlaHabilVenceService.msHabilesEntre` es de instancia, sin dependencias, y se carga desde
  `dist/` con `createRequire` (precedente: `scripts/post-deploy-smoke-matriz-permisos.mjs:36-45`).
  El calendario vive en el tenant; los feriados son master `feriados` + tenant `feriado_cliente`.
- Ningún artículo de `backend/ayuda/*.md` explica cómo se miden las métricas del dashboard;
  `mantenimiento-preventivo.md:23-25` dice que los preventivos no cuentan en las métricas de SLA.

## Diseño
- Columnas en `tickets` (tenant): `resolucion_habil_s INTEGER NULL CHECK (>= 0)` y
  `primera_respuesta_habil_s INTEGER NULL CHECK (>= 0)`. Sin default.
- `resolucion_habil_s` se escribe en `guardarSiVersion`, desde el resultado del pliegue: el
  acumulado si el estado es RESUELTO o CERRADO y la regla es HABIL; NULL en cualquier otro caso
  (reapertura incluida). Un ticket CORRIDO resuelto después del deploy queda NULL (caso marginal:
  solo tickets de antes del 2026-09-09 que sigan abiertos).
- `primera_respuesta_habil_s` se escribe en `registrarSiFalta`, en el mismo `UPDATE ... WHERE
  primera_respuesta_at IS NULL`. El cálculo hábil se hace antes de la transacción del comentario.
- Backfill:
  - en la migración, SQL: `resolucion_habil_s = sla_acumulado_s` para tickets HABIL en RESUELTO o
    CERRADO, con reloj incorporado y sin pliegue pendiente;
  - script por tenant (`scripts/backfill-tiempos-habiles.mjs`, idempotente, DryRun por defecto):
    para los que siguen NULL en RESUELTO/CERRADO (sin reloj o CORRIDO), horas hábiles desde
    `created_at` hasta el último paso a RESUELTO del historial (`operaciones_ticket`); y para
    `primera_respuesta_habil_s`, horas hábiles `created_at → primera_respuesta_at`. Calendario
    actual del tenant.
- Dashboard: `AVG` en SQL sobre las columnas, `WHERE ... IS NOT NULL`, sin preventivos en los dos.
  Etiqueta del frontend: "Tiempo promedio de resolución (horas hábiles, sin pausas)".

## Criterios de aceptación
- CA1: la migración agrega las dos columnas y hace el backfill SQL; su `rollback.sql` las borra y se
  puede correr dos veces.
- CA2: al plegar un ticket HABIL que llega a RESUELTO, `resolucion_habil_s` = acumulado final
  (incluido el último tramo); al pasar a CERRADO no cambia; al reabrir queda NULL; al volver a
  RESUELTO se toma de nuevo. CORRIDO queda NULL.
- CA3: al registrarse la primera respuesta se guarda `primera_respuesta_habil_s`; no cambia en
  comentarios posteriores.
- CA4: el script, en DryRun, informa por tenant cuántas filas tocaría y no escribe; con `--apply`
  completa solo las NULL; correrlo dos veces no cambia nada. Usa el último paso a RESUELTO del
  historial, no `fecha_cierre`.
- CA5: el dashboard promedia con `AVG` en SQL, sin traer filas a memoria; los preventivos quedan
  fuera de los dos promedios; mismo filtro por ciclo y por responsable que hoy.
- CA6: el frontend muestra la etiqueta nueva.

## Tareas
- [x] **T1 — Migración y backfill SQL** (CA1). Ruta: delegada (escritor único). Base: `5728626b`.
  - Archivos: `backend/prisma_tenant/migrations/20261015140000_tiempos_habiles_tickets/{migration,rollback}.sql`,
    `backend/prisma_tenant/schema.prisma`, `ticket.mapper.ts` (las dos columnas entran a
    `ColumnasRelojSla`: el upsert de la entidad nunca las escribe) y su spec,
    `tickets-tiempos-habiles.integration.spec.ts` (nuevo), `tickets-primera-respuesta.integration.spec.ts`
    (su assert de rollback contaba `primera_respuesta%` y atrapaba la columna nueva: se acota a las de M4).
  - Las migraciones llegan a las bases de test por `TenantMigrationRunnerAdapter.run`, que aplica todas.
  - Evidencia: `pnpm vitest run tickets-tiempos-habiles… tickets-primera-respuesta… tickets-reloj-sla…` →
    `Test Files 3 passed (3) · Tests 21 passed (21)`; `ticket.mapper.spec.ts` → `9 passed`;
    `pnpm typecheck` → sin errores.
- [x] **T2 — Escritura de `resolucion_habil_s` en el pliegue del reloj** (CA2). Ruta: delegada. Base: `77ee4430`.
  - Archivos: `reloj-sla.ts` (`RelojSlaResultado.resolucionHabilS`: acumulado si el estado del ticket
    es RESUELTO o CERRADO y la regla es HABIL; si no, null), `prisma-reloj-sla.repository.ts` (lo
    escribe en el mismo `updateMany` del CAS), `i-reloj-sla.repository.ts` (doc), specs:
    `reloj-sla.resolucion.spec.ts` (nuevo), `reloj-sla.meta.spec.ts`, `aplicar-sla.use-case.spec.ts`,
    `prisma-reloj-sla.repository.integration.spec.ts`, `consolidar-reloj-sla.integration.spec.ts`.
  - `conMeta` esparce el resultado del pliegue, así que `AplicarSla` conserva el valor. Repriorizar un
    RESUELTO reescribe el mismo acumulado (RESUELTO no es terminal; CERRADO/CANCELADO se saltean): test
    agregado.
  - `soporte_tenant_test` no recibe migraciones sola: se aplicó con
    `DATABASE_URL_TENANT=…/soporte_tenant_test pnpm migrate:tenant`.
  - Evidencia: `pnpm vitest run src/sla …reloj-sla.integration… …marcador.integration…` →
    `Test Files 21 passed (21) · Tests 192 passed (192)`; `pnpm typecheck` → sin errores.
- [ ] **T3 — Escritura de `primera_respuesta_habil_s`** (CA3).
- [ ] **T4 — Script de backfill por tenant** (CA4).
- [ ] **T5 — Dashboard con `AVG` y etiqueta del frontend** (CA5, CA6).
- [ ] **T6 — Cierre**:
  - roadmap: fila de la deuda RESUELTA, corrigiendo que la resolución era en horas corridas; fila
    nueva de deuda: al reabrir un ticket desde CERRADO, `sla_cumplido` del cierre anterior queda
    hasta el próximo RESUELTO (`reloj-sla.ts:115-116`);
  - `DEPLOY-VPS-runbook.md`: orden migración → deploy → script DryRun → script real, y rollback;
  - deuda de Ayuda anotada (no hay artículo que se vuelva falso);
  - compuertas: backend `pnpm lint`, `pnpm typecheck`, `pnpm test`; frontend `pnpm lint`,
    `pnpm type-check`, `pnpm test`; `check-roadmap-fresco`, `check-casts-en-specs`.

## Precondición de deploy
Migración de tenant con backfill: `predeploy-dump.ps1` como siempre. Después del deploy, el script
en DryRun y luego real, antes de que alguien mire el dashboard.

## Ruta y entrega
- Delegada: un escritor (muchos archivos no triviales).
- RDD apagada. TDD no exigido (§6.1: es feature), pero cada tarea lleva sus tests.
- Previsión: ~700 líneas, sobre la heurística de 400. GitHub en pausa: un commit por tarea en
  `feat/promedios-dashboard-habiles` y merge local.

## Progreso
- 2026-10-15: exploración hecha, diseño aprobado por el dueño, documento creado.

## Próximo paso
T1.
