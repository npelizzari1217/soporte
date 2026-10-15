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
- [x] **T3 — Escritura de `primera_respuesta_habil_s`** (CA3). Ruta: delegada. Base: `8079f082`.
  - Archivos: `crear-comentario.use-case.ts` (calcula `Math.round(msHabilesEntre(ticket.createdAt,
    instante) / 1000)` antes de la tx), puerto y repo `registrarSiFalta(ticketId, instante, habilS)` (mismo
    `UPDATE … WHERE primera_respuesta_at IS NULL`), `tickets.module.ts` (importa
    `CalendarioLaboralModule`, que solo importa `AuthModule`: sin ciclo; inyecta
    `CALENDARIO_LABORAL_SEMANAL_REPOSITORY` y `FERIADOS_LABORALES_REPOSITORY`, los mismos que usa el
    dashboard), specs `crear-comentario.use-case.spec.ts` y `primera-respuesta.integration.spec.ts`.
  - Decisión: el chequeo barato existe. El ticket ya leído trae `relojSla.primeraRespuestaAt`; el
    calendario se carga solo si el comentario cuenta como primera respuesta Y esa fecha es null. Si otro
    comentario gana la carrera, el UPDATE condicionado no escribe ni la fecha ni los segundos.
  - Evidencia: `pnpm vitest run crear-comentario.use-case.spec.ts primera-respuesta.integration.spec.ts`
    → `Test Files 2 passed (2) · Tests 27 passed (27)`; cableado: `sla-primera-respuesta.e2e`,
    `tickets.e2e`, `integraciones-api-v1-tickets.e2e` → `Test Files 3 passed (3) · Tests 45 passed (45)`;
    `pnpm typecheck` → sin errores.
- [x] **T4 — Script de backfill por tenant** (CA4). Ruta: delegada. Base: `ffa4f2dd`.
  - Archivos: `backend/scripts/backfill-tiempos-habiles.mjs` (nuevo) y
    `backend/scripts/backfill-tiempos-habiles.integration.spec.ts` (nuevo). El lint ya cubre
    `scripts/**/*.mjs`: no hizo falta tocar `eslint.config.js`.
  - Forma: `backfillTenant({ pool, feriadosGlobales, calculo, mapper, aplicar })` recibe todo por
    parámetro (precedente `backfill-correo-clientes.mjs`); `main()` lista los tenants como
    `migrate-tenants.js`, abre los pools con `conUtc` y toma de `dist/` el cálculo, el mapper y `conUtc`.
    Los `@db.Date` se piden como `fecha::timestamp AT TIME ZONE 'UTC'` (lo que devuelve Prisma) para
    que `PrismaCalendarioLaboralMapper` aplique su regla sin reimplementarla. Lotes de 500 con
    `unnest`, cada UPDATE con `IS NULL`. Error en un tenant: se informa, sigue con el resto y sale 1.
  - Hecho corregido: la tabla tenant es `feriados_cliente` (no `feriado_cliente`) y la de tipos es
    `tipo_operacion`.
  - Evidencia: `pnpm vitest run scripts/backfill-tiempos-habiles.integration.spec.ts` →
    `Test Files 1 passed (1) · Tests 4 passed (4)` (ensayo no escribe; `--apply` da 11 h por el último
    paso a RESUELTO y 12 h con feriado global + propio; segunda corrida 0). Con `dist/` recién
    construido, `DATABASE_URL_MASTER=…/soporte_master_test node scripts/backfill-tiempos-habiles.mjs` →
    `ENSAYO …; 1 tenant(s) activo(s)` y `ERROR database "…" does not exist` para un registro huérfano de
    la base de test, `exit=1` (carga de `dist/` y manejo por tenant verificados); `--foo` →
    `argumento desconocido`, `exit=1`. `eslint` sobre los dos archivos → sin salida.
- [x] **T5 — Dashboard con `AVG` y etiqueta del frontend** (CA5, CA6). Ruta: delegada. Base: `8a651586`.
  - Archivos: `prisma-dashboard.repository.ts` (los dos tiempos medios son `ticket.aggregate({ _avg })`
    con `IS NOT NULL`, `sinPreventivos` en los dos y el mismo `buildWhere`; segundos / 3600 sin redondeo,
    igual que antes; `null` sin filas), `i-dashboard.repository.ts` (doc), `dashboard.module.ts` (el
    repo ya no recibe calendario ni feriados; se quita `CalendarioLaboralModule` de sus imports),
    `promedio-horas-habiles.ts` y su spec BORRADOS (su único usuario era este repo),
    `prisma-dashboard.integration.spec.ts`, `tareas-completadas-dashboard.integration.spec.ts`
    (constructor), `frontend/…/dashboard-view.tsx` y su test (etiqueta nueva).
  - Ayuda: ningún artículo describe cómo se miden los tiempos del dashboard;
    `mantenimiento-preventivo.md:23-25` sigue siendo cierto. Deuda anotada en el commit.
  - Evidencia: `pnpm vitest run src/dashboard` → `Test Files 4 passed (4) · Tests 51 passed (51)`;
    frontend `pnpm vitest run src/features/dashboard` → `Test Files 3 passed (3) · Tests 31 passed (31)`;
    `pnpm typecheck` backend → sin errores; `eslint` frontend del feature → sin salida.
- [x] **T6 — Cierre**: Ruta: delegada. Base: `e61f876a`.
  - Hecho: fila de deuda RESUELTA y corregida (la resolución eran horas corridas); fila nueva de
    `sla_cumplido` al reabrir desde CERRADO (`reloj-sla.ts:123-124`; hoy no se ve porque la reapertura
    limpia `fecha_cierre`); sección "Tiempos hábiles del dashboard" en el runbook.
  - Evidencia (2026-10-15): backend `pnpm lint` → sin errores; `pnpm typecheck` → sin errores;
    `pnpm test` → `Test Files 740 passed (740) · Tests 8833 passed (8833)`; frontend `pnpm lint` → exit 0;
    `pnpm type-check` → exit 0; `pnpm test` → `Test Files 273 passed (273) · Tests 2277 passed (2277)`;
    `node scripts/check-roadmap-fresco.mjs` → `El roadmap esta fresco.`;
    `node scripts/check-casts-en-specs.mjs` → `594 en 111 archivos (base: 594 en 111)`.
  - Plan original:
  - roadmap: fila de la deuda RESUELTA, corrigiendo que la resolución era en horas corridas; fila
    nueva de deuda: al reabrir un ticket desde CERRADO, `sla_cumplido` del cierre anterior queda
    hasta el próximo RESUELTO (`reloj-sla.ts:115-116`);
  - `DEPLOY-VPS-runbook.md`: orden migración → deploy → script DryRun → script real, y rollback;
  - deuda de Ayuda anotada (no hay artículo que se vuelva falso);
  - compuertas: backend `pnpm lint`, `pnpm typecheck`, `pnpm test`; frontend `pnpm lint`,
    `pnpm type-check`, `pnpm test`; `check-roadmap-fresco`, `check-casts-en-specs`.

- [x] **T7 — JD-W1: el pliegue no borra el valor de un ticket CORRIDO resuelto.** Hallazgo de los dos
  jueces de `judgment-day` (2026-10-15): el script completa `resolucion_habil_s` de tickets CORRIDO y
  un pliegue posterior (AplicarSla al repriorizar un RESUELTO, o el barrido) lo pisa con NULL. Cambio:
  para CORRIDO en RESUELTO/CERRADO el pliegue no escribe la columna (la deja como está); al reabrir
  sigue poniendo NULL. Así una segunda corrida del script vuelve a dar 0.
  - Ruta: inline (bugfix acotado de `judgment-day`, actor de corrección). Commit previo: `cdb877ae`.
  - Archivos: `backend/src/sla/domain/entities/reloj-sla.ts` (`resolucionHabilS?: number | null`:
    `undefined` = no tocar), `prisma-reloj-sla.repository.ts` (omite la columna si es `undefined`),
    `i-reloj-sla.repository.ts` (doc). `conMeta` hace spread de la base y conserva la semántica.
  - Tests: `reloj-sla.resolucion.spec.ts` (CORRIDO RESUELTO y CERRADO → `undefined`; CORRIDO reabierto
    → `null`) y `prisma-reloj-sla.repository.integration.spec.ts` (valor 4000 guardado sobrevive a
    `plegar` + `guardarSiVersion` de un CORRIDO RESUELTO y queda NULL al reabrir).
  - RED: `AssertionError: expected null to be undefined` (dominio, 2 tests) y
    `AssertionError: expected null to be 4000 // Object.is equality` (integración).
  - GREEN: `pnpm vitest run src/sla` → 19 archivos, 192 tests pasan.
- [x] **T8 — JD-W2: un fallo del calendario no bloquea el comentario.** Hallazgo de los dos jueces
  (A como sugerencia, B como advertencia): si la carga del calendario o de los feriados (master) o
  `msHabilesEntre` fallan, el comentario se rechaza. Cambio: se loguea y se guarda la primera
  respuesta con `primera_respuesta_habil_s` NULL.
  - Ruta: inline (bugfix acotado de `judgment-day`). Commit previo: `12bb0a96`.
  - Archivos: `crear-comentario.use-case.ts` (`segundosHabiles` atrapa el error, loguea
    `PRIMERA_RESPUESTA_HABIL_FALLO | ticket=<id> | <error>` sin el texto y devuelve `null`; nuevo
    parámetro `logger: Pick<ILogger, 'error'>`), `tickets.module.ts` (inyecta `LOGGER`),
    `primera-respuesta.integration.spec.ts` (pasa el logger).
  - Tests: `crear-comentario.use-case.spec.ts` — el calendario rechaza y `msHabilesEntre` lanza; en los
    dos el comentario se guarda, `registrarSiFalta` recibe `null` y el log no lleva el texto.
  - RED: `Error: master caído` y `Error: rango excedido` (2 tests fallan, el comentario se rechaza).
  - GREEN: `crear-comentario.use-case.spec.ts` + `primera-respuesta.integration.spec.ts` → 29 tests pasan.
- [x] **T9 — JD-W3: el script no escribe sobre un ticket reabierto.** Hallazgo del juez A: el `UPDATE`
  por lotes solo revisa `IS NULL`; si el ticket se reabre entre la lectura y la escritura, queda con
  tiempo de resolución estando abierto. Cambio: el `UPDATE` exige además que el estado siga siendo
  RESUELTO o CERRADO.
  - Ruta: inline (bugfix acotado de `judgment-day`). Commit previo: `f3f4c2c1`.
  - Archivos: `backend/scripts/backfill-tiempos-habiles.mjs` (`escribirEnLotes` acepta una condición
    extra; la de resolución exige `EXISTS` sobre `estados` con `codigo IN ('RESUELTO','CERRADO')`; la
    de primera respuesta no cambia).
  - Test: `backfill-tiempos-habiles.integration.spec.ts` — un pool envoltorio reabre el ticket justo
    antes del `UPDATE` de resolución; el ticket queda en NULL y `actualizados` es 0.
  - RED: `AssertionError: expected { aActualizar: 1, …(2) } to deeply equal { aActualizar: 1, …(2) }`
    (`actualizados` 1 en vez de 0).
  - GREEN: `backfill-tiempos-habiles.integration.spec.ts` → 5 tests pasan.
- Decisión del dueño (2026-10-15): las tres advertencias se corrigen antes del merge, con re-juicio
  acotado de `judgment-day` sobre el delta.
- [x] **T10 — JD-W4: el pliegue detecta una reapertura entre transiciones pendientes.** Hallazgo de
  los dos jueces en el re-juicio de T7-T9 (causado por T7): si la reapertura y la nueva resolución de
  un ticket CORRIDO se pliegan en un solo pliegue (reloj pendiente que recoge el barrido), el pliegue
  solo ve el estado final RESUELTO, devuelve `undefined` y sobrevive el valor viejo del backfill.
  Cambio: si dentro de las operaciones plegadas hubo una reapertura, el pliegue devuelve `null`.
  - Ruta: inline (bugfix acotado de `judgment-day`, un archivo de dominio). Commit previo: `35997e9f`.
  - Archivo: `backend/src/sla/domain/entities/reloj-sla.ts` (`reabrio`: alguna transición posterior
    al cursor sale de RESUELTO/CERRADO a un estado que no lo es; para CORRIDO resuelto da `null` en
    vez de `undefined`). El historial sin secuencia de un previo no cuenta: el backfill ya midió con
    todo el historial hasta el último RESUELTO.
  - Tests: `reloj-sla.resolucion.spec.ts` — CORRIDO RESUELTO→EN_PROCESO→RESUELTO en un pliegue →
    `null`; CORRIDO CERRADO→EN_PROCESO→RESUELTO→CERRADO → `null`; CORRIDO previo con reapertura solo
    en el historial → `undefined`.
  - RED: `AssertionError: expected undefined to be null` (2 tests).
  - GREEN: `pnpm vitest run src/sla` → 19 archivos, 195 tests pasan.
- [x] **T11 — JD-S1: el script no escribe una resolución vieja.** Sugerencia de los dos jueces: si el
  ticket se reabre y se vuelve a resolver entre la lectura y la escritura del script, se escribe con
  el `fin` viejo. Cambio: el `UPDATE` exige además que no haya un pase a RESUELTO posterior al `fin`
  leído.
  - Ruta: inline (bugfix acotado de `judgment-day`, el script y su spec). Commit previo: `4024bf5e`.
  - Archivo: `backend/scripts/backfill-tiempos-habiles.mjs` — la lectura toma el último pase a
    RESUELTO con su id (`ORDER BY created_at DESC, id DESC LIMIT 1` en vez de `max`); el `UPDATE`
    recibe `fin_id` y `SIGUE_RESUELTO` exige además `NOT EXISTS` de un pase a RESUELTO con
    `created_at` mayor que el de esa operación. La comparación es en SQL y por id porque `pg`
    devuelve el `timestamptz` como `Date` sin los microsegundos que guarda `now()`: comparar contra
    el `fin` leído haría que el script no escribiera nunca en prod (hallado al implementar).
  - Tests: `backfill-tiempos-habiles.integration.spec.ts` — un pool envoltorio reabre y vuelve a
    resolver el ticket antes del `UPDATE`: queda NULL y la corrida siguiente lo toma con el último
    pase (10 h); y un pase a RESUELTO con microsegundos se escribe (3 h).
  - RED: S1 `actualizados` 1 en vez de 0; microsegundos (con la primera versión, que comparaba contra
    el `fin` leído) `actualizados` 0 en vez de 1.
  - GREEN: `backfill-tiempos-habiles.integration.spec.ts` → 7 tests pasan; eslint y prettier limpios.
- Decisión del dueño (2026-10-15): W4 y S1 se corrigen como ronda 2 (la última que permite
  `judgment-day`), con re-juicio acotado sobre el delta.

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
- 2026-10-15: T1-T6 hechas, una por commit, con las compuertas en verde.

## Próximo paso
Merge local a `main` (decisión del dueño), deploy según el runbook ("Tiempos hábiles del
dashboard") y el script en ensayo y después con `--apply`.
