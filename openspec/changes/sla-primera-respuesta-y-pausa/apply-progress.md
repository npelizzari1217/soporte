# Apply progress: sla-primera-respuesta-y-pausa

## WU-1 — Estado ESPERANDO_CLIENTE, constantes y guardia (completa)

Modo: estandar (sin TDD estricto). Tareas 1.1 a 1.10 marcadas en `tasks.md`. Rama `feat/sla-primera-respuesta-y-pausa-wu01`, base el tracker `feat/sla-primera-respuesta-y-pausa`.

### Archivos

- Migracion M1 `backend/prisma_tenant/migrations/20261007120000_estado_esperando_cliente/` (`migration.sql` con `ON CONFLICT (codigo) DO NOTHING`, `rollback.sql`).
- `backend/src/tickets/domain/state-machine/estados.constants.ts`: `ESTADOS_RELOJ_CORRE`, `ESTADOS_NO_DESTINO_CORRECTIVO`, `afectaRelojSla`.
- `base-ticket-state-machine.ts`: arcos EN_PROCESO→ESPERANDO_CLIENTE y ESPERANDO_CLIENTE→EN_PROCESO/RESUELTO/CANCELADO.
- `transicionar-estado.use-case.ts`: `saltoCorrectivo` excluye `ESTADOS_NO_DESTINO_CORRECTIVO`.
- `tenant-seeder.adapter.ts`: estado sembrado con `orden` 35.
- Tests: `estados.constants.spec.ts` (nuevo), `base-ticket-state-machine.spec.ts`, `transicionar-estado.use-case.spec.ts`, `tenant-seeder.adapter.spec.ts`, `tenant-seeder.adapter.integration.spec.ts`, `crear-cliente.e2e.spec.ts`; comentarios de "6 estados" actualizados en `tickets.e2e.spec.ts`, `ticket-state-machine.factory.spec.ts`, `i-ticket-state-machine.ts`, `prisma-estado.repository.ts`.

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/tickets src/catalogos src/clientes`: 108 archivos, 999 tests verdes |
| Runtime harness | Integracion `tenant-seeder.adapter.integration.spec.ts` sobre tenant efimero migrado con `migrate deploy`: M1 deja el estado una vez, reaplicar M1 y `seed()` dos veces no lo duplican; `crear-cliente.e2e.spec.ts` verifica los 7 codigos en orden |
| Rollback | `rollback.sql` de M1 (probado en una transaccion descartada sobre `soporte_tenant_test`); constantes y guardia sin consumidores externos |
| Lint / tipos | `pnpm lint` y `pnpm typecheck` sin errores; ratchet de casts 626 (base 626) |

### Decisiones tomadas en apply

- `afectaRelojSla` se implementa como `corre(anterior) !== corre(nuevo) || nuevo === 'RESUELTO'`. Consecuencias: EN_PROCESO→CANCELADO es verdadero (corre→detenido), ESPERANDO_CLIENTE→CANCELADO y RESUELTO→CERRADO son falsos (ambos detenidos).
- `ESTADOS_RELOJ_CORRE = {NUEVO, ASIGNADO, EN_PROCESO}`.
- El `rollback.sql` reubica tambien `operaciones_ticket.estado_anterior_id/estado_nuevo_id` en EN_PROCESO, ademas de `tickets.estado_id`: ambas son FK a `estados` y sin eso el `DELETE` fallaria con historial.
- El test de M1 vive en el spec de integracion del seeder (ya levanta un tenant efimero migrado) y ejecuta el `migration.sql` real. El caso existente `seed()` borra antes la fila de ESPERANDO_CLIENTE para que pruebe el seed y no la migracion (mismo patron que PREVENTIVO).
- Los "5 specs que cuentan 6 estados": seeder unit, seeder integration, `crear-cliente.e2e`, maquina base y comentario de `tickets.e2e`.
- Frontend (`estado-transitions.ts`, badge) queda en WU-9b, como indica `tasks.md`.
- Ayuda: `ayuda/tickets-listado.md` lista los estados del ticket; no se vuelve falsa (el estado no es alcanzable desde la UI hasta WU-9b). Deuda anotada en el commit.

### Deuda

- Ayuda: estado "Esperando al cliente" en tickets (escritura suspendida).
- M1 no se despliega sin las WU-3 (cadena completa).

## WU-2 — Motor de tiempo habil y medidores (parte 1 de 2: motor, tareas 2.1 a 2.4)

Modo: estandar (sin TDD estricto). Rama `feat/sla-primera-respuesta-y-pausa-wu02`, base `feat/sla-primera-respuesta-y-pausa-wu01`. La WU se partio en dos commits apilados por presupuesto de 400 lineas: este es el motor; los medidores (2.5 a 2.7) van en `...-wu02b`.

### Archivos

- `backend/src/calendario-laboral/domain/services/calcular-sla-habil-vence.service.ts`: `sumarMsHabiles`, `msHabilesEntre`, `LIMITE_DIAS_RANGO = 3_700`; `venceAt` delega en `sumarMsHabiles(creadoEn, horas * 3_600_000)`; `buscarInicioVentanaAbierta` con `tope` opcional (sobrecarga: con `tope` devuelve `null`, sin `tope` lanza como antes).
- Test: `calcular-sla-habil-vence.service.spec.ts` (bloque nuevo; los tests de `venceAt` existentes sin cambios).

### Work Unit Evidence

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/calendario-laboral` |
| Runtime harness | N/A: dominio puro, sin frontera de runtime |
| Rollback | Funciones nuevas; `venceAt` conserva su contrato (tests previos intactos) |

### Decisiones tomadas en apply

- `tope` es un `Date`: la busqueda devuelve `null` si el dia candidato empieza en o despues del tope, o si agota la cota. `msHabilesEntre` ademas valida upfront que el rango no pase de 3.700 dias (lanza), y acota las iteraciones.
- `sumarMsHabiles` exige `ms` finito y `>= 0` (no entero): `venceAt` con horas fraccionarias sigue funcionando como antes. Con `ms = 0` devuelve `desde` sin alinear a ventana.
- Sin redondeo en el motor; el redondeo a segundos por tramo queda en `RelojSla` (WU-3b).
- El limite de 400 ventanas se prueba con un calendario de 7 dias abiertos: 400 pasan y 402 lanzan.

### Deuda

- Ayuda: ninguna (no visible para el usuario).

## WU-2 — parte 2 de 2: medidores (tareas 2.5 a 2.7)

Rama `feat/sla-primera-respuesta-y-pausa-wu02b`, base `feat/sla-primera-respuesta-y-pausa-wu02`. Con esta parte la WU-2 queda completa.

- `backend/src/sla/domain/services/`: `medidor-tiempo-sla.ts` (`MedidorTiempoSla { entre; sumar }`), `medidor-habil.ts` (servicio, calendario y feriados vigentes por constructor), `medidor-corrido.ts` (tiempo de pared). Test: `medidores-sla.spec.ts`.
- Evidencia: `pnpm vitest run src/calendario-laboral src/sla/domain` verde; dominio puro, sin runtime harness (N/A). Rollback: archivos nuevos sin consumidores.
- Ayuda: ninguna deuda.

## WU-3a — M2, columnas del reloj, repo y marcador (parte 1 de 2: migracion, tareas 3a.1 a 3a.5)

Modo: estandar. Rama `feat/sla-primera-respuesta-y-pausa-wu03a`, base `feat/sla-primera-respuesta-y-pausa-wu02b`. Partida por presupuesto de 400 lineas: esta mitad es la migracion con su integracion; el repo y el marcador (3a.6 a 3a.13) van en la segunda.

- Migracion `backend/prisma_tenant/migrations/20261007130000_tickets_reloj_sla/` (`migration.sql`, `rollback.sql`): 7 columnas de `tickets` con los DEFAULT en un segundo paso, 2 CHECK, indice parcial `tickets_sla_reloj_pendiente_idx`, `operaciones_ticket.sla_reloj_seq` con su indice parcial.
- `schema.prisma`: columnas con `@default` y el comentario contra la trampa de `sla_regla`; `@@index(... map:)` para los dos indices parciales.
- `ticket.mapper.ts`: el `Omit` de `toPersistence` excluye las 7 columnas (necesario para que compile el cliente regenerado); fixtures de `ticket.mapper.spec.ts` y `operacion-ticket.mapper.spec.ts` con las columnas nuevas.
- Test: `tickets-reloj-sla.integration.spec.ts` (tenant efimero). Para el ticket "previo" corre el `rollback.sql`, siembra la fila y reaplica el `migration.sql` real: acumulado y corre_desde quedan NULL. La deriva Prisma/DDL lee los `@default` de `schema.prisma` porque el DMMF de runtime no los trae.

### EXPLAIN / medicion de M2 (3a.5), `soporte_tenant_test`, dentro de una transaccion con ROLLBACK
50.000 tickets previos sembrados con M2 deshecho; `migration.sql` completo: cada ALTER < 1 ms (los `ADD COLUMN ... NOT NULL DEFAULT` constantes no reescriben la tabla), `SET DEFAULT` 7-8 ms, `CREATE INDEX` parcial 21 ms y el de operaciones 6 ms. Las 50.000 filas quedan con `sla_acumulado_s` NULL (previos). Con 500 filas pendientes: `Bitmap Index Scan on tickets_sla_reloj_pendiente_idx`, 0,019 ms, ejecucion total 0,141 ms. El `EXPLAIN ANALYZE` no aplica a DDL: se midio con `\timing`.

### Work Unit Evidence (parte 1)

| Evidence | Valor |
|---|---|
| Test focal | `pnpm vitest run src/tickets/infrastructure/persistence/prisma/tickets-reloj-sla.integration.spec.ts`: 8 tests verdes |
| Runtime harness | Postgres real, tenant efimero migrado con `migrate deploy`; rollback y reaplicacion de M2 |
| Rollback | `rollback.sql` de M2; el resto son archivos de prueba y tipos |

M2 no se despliega sin la cadena completa.

## WU-3a.2 — repo acotado y snapshot del reloj (tareas 3a.6 a 3a.8)

Rama `feat/sla-primera-respuesta-y-pausa-wu03a2`, base `...-wu03a`.

- `prisma-ticket.repository.ts`: la rama `update` del upsert descarta `slaVenceAt` y `vencido`; la rama `create` fija `slaAcumuladoS: 0` y `slaCorreDesde = createdAt`.
- `ticket.entity.ts`: `RelojSlaSnapshot` de solo lectura (getter `relojSla`, `null` antes de persistir), cargado por `TicketMapper.toDomain`.
- Tests: `prisma-ticket-repository.save.integration.spec.ts` (alta incorporada; `save` con lectura vieja deja `slaVenceAt` y `vencido` intactos) y casos nuevos en `ticket.mapper.spec.ts`.
- Evidencia: `pnpm vitest run src/tickets src/equipos/mantenimiento` 61 archivos, 621 tests verdes; lint y typecheck limpios; ratchet de casts 626 (base 626). Rollback: el repo y la entidad sin consumidores nuevos.

## WU-3a.3 — marcador del reloj y evento (tareas 3a.9 a 3a.14)

Rama `feat/sla-primera-respuesta-y-pausa-wu03a3`, base `...-wu03a2`. Con esta parte la WU-3a queda completa.

- Puertos `IRelojSlaMarcador` y `IPrimeraRespuestaWriteRepository` (este solo declarado) en `tickets/domain/ports`; `TicketTransicionadoEvent` (`'ticket.transicionado'`).
- `PrismaRelojSlaMarcador`: `ticket.update` con `increment` de `sla_reloj_version` (toma el lock de la fila) y `operacionTicket.update` con `slaRelojSeq`. Registrado en `TicketsModule` y pasado como 9.o argumento a `TransicionarEstadoUseCase`.
- `TransicionarEstadoUseCase`: dentro de la tx, despues de `save(ticket)` y `save(operacion)`, marca solo si `afectaRelojSla`, y publica el evento en `alCommitear`.
- Tests: unit del caso de uso (marca y publica solo si afecta; NUEVO a ASIGNADO no; marcador que falla no publica) y `prisma-reloj-sla-marcador.integration.spec.ts` (rollback no deja version ni seq ni evento; dos transiciones concurrentes dan seq 1 y 2 y version 2).
- Decision: los tests T13 existentes filtran por clase de evento, porque RESUELTO ahora publica dos eventos (el de notificaciones y `ticket.transicionado`); el mock de `alCommitear` imita al runner real (callback protegido).
- Evidencia: lint y typecheck limpios; `pnpm vitest run src/tickets src/equipos/mantenimiento` verde. Rollback: el marcador sin listener no tiene efecto observable (columnas nuevas sin consumidores hasta la WU-3b).

## WU-3a.3 — marcador del reloj y evento (tareas 3a.9 a 3a.14)

Rama `feat/sla-primera-respuesta-y-pausa-wu03a3`, base `...-wu03a2`.

- Puertos `IRelojSlaMarcador` y `IPrimeraRespuestaWriteRepository` (este solo declarado) en `tickets/domain/ports`; `TicketTransicionadoEvent` (`'ticket.transicionado'`).
- `PrismaRelojSlaMarcador`: `ticket.update` con `increment` de `sla_reloj_version` (toma el lock de la fila) y `operacionTicket.update` con `slaRelojSeq`. Registrado en `TicketsModule` y pasado como 9.o argumento a `TransicionarEstadoUseCase`.
- `TransicionarEstadoUseCase`: dentro de la tx, despues de `save(ticket)` y `save(operacion)`, marca solo si `afectaRelojSla`, y publica el evento en `alCommitear`.
- Tests: unit del caso de uso (marca y publica solo si afecta; NUEVO a ASIGNADO no; marcador que falla no publica) y `prisma-reloj-sla-marcador.integration.spec.ts` (rollback no deja version ni seq ni evento; dos transiciones concurrentes dan seq 1 y 2 y version 2).
- La asercion de DB de 3a.12 sobre `AsignarYPonerEnProcesoUseCase` (deja `sla_reloj_seq` NULL) va en el commit siguiente (WU-3a.4), por presupuesto de 400 lineas.

## WU-3a.4 — regresion de AsignarYPonerEnProceso

- `asignar-y-poner-en-proceso.reloj-sla.integration.spec.ts` (nuevo): el caso de uso real contra Postgres deja todas sus operaciones con `sla_reloj_seq` NULL y la version del reloj en 0. Cierra la asercion de DB de 3a.12.
- Verificacion: `pnpm vitest run` del spec 1/1, eslint del archivo limpio.
- Decision: los tests T13 existentes filtran por clase de evento, porque RESUELTO ahora publica dos eventos; el mock de `alCommitear` imita al runner real (callback protegido).
- Evidencia: lint y typecheck limpios; `pnpm vitest run src/tickets src/equipos/mantenimiento` verde. Rollback: sin listener el marcador no tiene efecto observable (columnas sin consumidores hasta la WU-3b).

## WU-3b.1 — `RelojSla` y puerto del repo (tareas 3b.1 a 3b.4, 3b.2b, 3b.7)

Rama `feat/sla-primera-respuesta-y-pausa-wu03b`, base `...-wu03a4`. Partida por presupuesto de 400 lineas: esta parte es el dominio puro con sus tests de pausa/reanudacion/derivado/orden; quedan para el siguiente intento 3b.5 y 3b.6 (specs ya escritos, en `git stash` `wu03b2`), 3b.8 a 3b.12.

- `sla/domain/entities/reloj-sla.ts`: `RelojSla.plegar` (pliegue puro; el estado actual manda sobre `corre_desde`, `acumulado NULL` = previo se incorpora, tiempos recortados a monotono, redondeo `Math.round(ms/1000)` por tramo, vencimiento derivado solo si termina corriendo y hubo reanudacion) y `RelojSla.medidorPara` (cohorte por `slaRegla`).
- `sla/domain/ports/i-reloj-sla.repository.ts`: `leer`, `historialSinSecuencia`, `transicionesDesde`, `guardarSiVersion`, `findPendientes`.
- Tests: `reloj-sla.spec.ts` (3b.1 a 3b.4, 3b.2b) y `reloj-sla.fixtures.ts` compartido.
- Mutacion 3b.5 (`<=` a `<` en el cumplimiento), corrida con el spec completo antes de partir: rojo (`acumulado igual a la meta cumple`, 1 fallo de 23) y verde al restaurar. El test vive en `reloj-sla.cumplimiento.spec.ts`, que va en el siguiente intento.
- Evidencia: `pnpm vitest run src/sla/domain` 34 tests verdes; lint, typecheck y ratchet de casts (626) limpios. Rollback: archivos nuevos sin consumidores.

## WU-3b.2 — repo Prisma del reloj y test del estado actual (tarea 3b.9; parte de 3b.8 y 3b.11)

Rama `feat/sla-primera-respuesta-y-pausa-wu03b2`, base `...-wu03b`. Partida por presupuesto: aca el repo con su integracion y el test unit de ADR-1; pendientes 3b.5/3b.6 (spec ya escrito, en stash `wu03b3`), 3b.8 (parte del caso de uso: idempotencia, `SLA_RELOJ_CONFLICTO`), 3b.10, 3b.11 (caso de uso, listener, modulo) y 3b.12.

- `PrismaRelojSlaRepository`: `guardarSiVersion` es un `updateMany where slaRelojVersion` que escribe `slaRelojSeqHasta = version` y limpia el pendiente; sin `slaVenceAt` en el resultado no lo pisa; `transicionesDesde` ordena por `slaRelojSeq`.
- Tests: `prisma-reloj-sla.repository.integration.spec.ts` (6, sin dejar filas: usa estados y tipo `CAMBIO_ESTADO` ya sembrados) y 2 casos nuevos en `reloj-sla.spec.ts` (el estado actual manda sobre el pliegue).
- Mutacion 3b.9 (`orderBy slaRelojSeq` a `createdAt` en `transicionesDesde`): rojo (`transicionesDesde ordena por sla_reloj_seq y no por created_at`, 1 de 6); restaurado, verde.
- Mutacion 3b.5 re-corrida (`<=` a `<`): rojo 1 fallo, restaurado verde; el test esta en el spec en stash.

## WU-3b.3 — cumplimiento, caso de uso, listener y modulo (tareas 3b.5, 3b.6, 3b.10, 3b.11)

Rama `feat/sla-primera-respuesta-y-pausa-wu03b3`, base `...-wu03b2`. Pendientes: la mitad de caso de uso de 3b.8 (integracion con repo real: CAS con version vieja deja pendiente, re-pliegue idempotente) y 3b.12 (verificacion final).

- `reloj-sla.cumplimiento.spec.ts` (3b.5, 3b.6): mutacion `<=` a `<` re-corrida, rojo (1 fallo) y verde al restaurar.
- `ConsolidarRelojSlaUseCase`: calendario y feriados antes de leer; un reintento del CAS; si falla otra vez devuelve `conflicto` y registra `SLA_RELOJ_CONFLICTO` (el ticket sigue pendiente porque el marcador lo dejo asi); `historialSinSecuencia` solo con `acumuladoS` null.
- `RelojSlaListener` (`ticket.transicionado`, log-and-swallow `SLA_RELOJ_ERROR`) y registro en `SlaModule` (`RELOJ_SLA_REPOSITORY`, caso de uso, listener); `SlaModule` no importa nada nuevo de tickets, sin ciclo.
- Fixtures: se exporta `calendarioSemanal`.
- Evidencia: `pnpm vitest run src/sla` verde; lint y typecheck limpios.

## WU-3b.4 — integracion del caso de uso (tarea 3b.8, cierre de 3b.12)

Rama `feat/sla-primera-respuesta-y-pausa-wu03b4`, base `...-wu03b3`. Con esta parte la WU-3b queda completa.

- `consolidar-reloj-sla.integration.spec.ts`: el caso de uso con el `PrismaRelojSlaRepository` real. Una version que sube entre la lectura y la escritura da `conflicto`, registra `SLA_RELOJ_CONFLICTO` y deja `sla_reloj_pendiente = true`; consolidar dos veces sin operaciones nuevas no cambia nada (salvo `updated_at`). El spec borra sus filas (prefijo `WU3BC`) al empezar y al terminar.
- El registro de `SlaModule` (repo, caso de uso, listener) queda cubierto en su DI por `src/app.module.smoke.spec.ts` (1/1).
- Verificacion de la WU: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/sla src/tickets` y ratchet de casts, ver el commit.

## WU-3c.1 — barrido que reconcilia y marca solo con reloj corriendo (tareas 3c.5 y 3c.7)

Rama `feat/sla-primera-respuesta-y-pausa-wu03c`, base `...-wu03b4`. Partida por presupuesto de 400 lineas: aca el barrido y la higiene de tests de la WU-3b; quedan para el siguiente intento 3c.1 a 3c.4 (`AplicarSla`, que ademas reescribe su spec, ~1000 lineas) y 3c.6 (integracion del barrido) y 3c.8 (verificacion final), en el stash `wu03c2`.

- `MarcarVencidosUseCase`: el paso 1 reconcilia los `sla_reloj_pendiente` con `ConsolidarRelojSlaUseCase` (un fallo por ticket se aisla; ese ticket sigue pendiente); el paso 2 usa `findVencibles`, que ahora exige `slaRelojPendiente = false` y `estado.codigo in ESTADOS_RELOJ_CORRE` (fuente unica, cubre tambien a los previos corriendo con `sla_corre_desde` NULL). `marcarVencido` devuelve `boolean` (el `updateMany` afecto 1 fila) y el evento `sla.vencido` sale solo si fue `true`: una marca ya puesta permanece y no se re-notifica.
- Tests: 4 casos nuevos en `marcar-vencidos.use-case.spec.ts` (orden reconciliar antes de evaluar, fallo aislado, marca ya puesta, un solo evento) y 3 en `prisma-sla-ticket.integration.spec.ts` (ESPERANDO_CLIENTE con vencimiento pasado, pendiente excluido, previo corriendo con `corre_desde` NULL; `marcarVencido` booleano). Ese spec usa el estado `NUEVO` real (el existente o uno creado que borra al final).
- Higiene de la WU-3b: `prisma-reloj-sla.repository.integration.spec.ts` barre al empezar sus filas (`WU3B*` sin `WU3BC*`, que es del spec de consolidacion) y `prisma-reloj-sla-marcador.integration.spec.ts` barre el tipo de operacion `WU3AO*` y sus operaciones; elimino la fila residual `WU3AOb5596d` de `soporte_tenant_test`. Los demas prefijos `WU3A*` los comparten otros specs y no se barren.
- Cableado: `SlaModule` pasa el repo del reloj y `ConsolidarRelojSlaUseCase` a `MarcarVencidosUseCase`.
- Evidencia: lint, typecheck, `pnpm vitest run src/sla src/tickets` y `src/app.module.smoke.spec.ts` verdes sobre este arbol; ratchet de casts 626 a 624 (el spec del barrido ya no usa `as never`), base bajada a 624 en 115 archivos.
