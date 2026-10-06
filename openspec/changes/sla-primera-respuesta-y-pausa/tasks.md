# Tasks: SLA de primera respuesta y pausa del reloj

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~3.810 (12 WU, cada una ≤ 400; las más cargadas son WU-3a ~390 y WU-6 ~380) |
| 400-line budget risk | High (total); Medium en WU-3a y WU-6; Low en las demás |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (WU-1) → PR2 → ... → PR12 (WU-9b), un PR por WU, en el orden 1, 2, 3a, 3b, 3c, 4, 5, 6, 7, 8, 9a, 9b |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

Modo estándar (feature, sin TDD estricto): los tests viajan en el mismo commit que el código. Los tests de invariantes de la tabla "Invariantes que DEBEN tener test" del diseño son tareas explícitas, con su mutación donde el diseño la pide.

Rama tracker: `feat/sla-primera-respuesta-y-pausa` (ya existe con los commits de planificación; solo ella mergea a `main`). El PR de la WU-1 apunta al tracker; el PR de cada WU apunta a la rama de la WU anterior de la cadena. Cada PR lleva diagrama de dependencia con 📍, inicio/fin, dependencias previas y fuera de alcance.

Ramas por WU (base entre paréntesis):
- WU-1 `feat/sla-primera-respuesta-y-pausa-wu01` (tracker)
- WU-2 `...-wu02` (wu01)
- WU-3a `...-wu03a` (wu02)
- WU-3b `...-wu03b` (wu03a)
- WU-3c `...-wu03c` (wu03b)
- WU-4 `...-wu04` (wu03c)
- WU-5 `...-wu05` (wu04)
- WU-6 `...-wu06` (wu05)
- WU-7 `...-wu07` (wu06)
- WU-8 `...-wu08` (wu07)
- WU-9a `...-wu09a` (wu08)
- WU-9b `...-wu09b` (wu09a)

Verificación común por WU (lo que aplique): backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run <rutas>`; frontend `JWT_SECRET=dummy pnpm lint`, `pnpm type-check`, `pnpm test`; raíz `node scripts/check-casts-en-specs.mjs` (el ratchet no debe subir). Todo spec que trunca `soporte_master_test` llama `usarLockMasterTest()`. Tenant efímero: limpiar filas → `app.close()` → `dropDatabase`. El `pnpm test` completo del backend corre al menos en la última WU de backend (WU-8).

Deuda de Ayuda (escritura suspendida desde 2026-09-07): anotar en commit y PR de las WU 1, 5, 8 y 9b (estado nuevo, regla de pausa, campo de prioridad, indicadores); corregir solo un artículo existente que el cambio vuelva falso.

Despliegue: solo la cadena completa. Si M1 llega a producción sin las WU-3, la espera existiría sin pausa. Las cuatro migraciones tenant corren por el fan-out `migrate:tenants` del deploy; el lockfile no se espera que cambie (sin dependencias nuevas).

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Estado `ESPERANDO_CLIENTE` (M1), constantes, máquina y guardia del salto | PR 1 (base tracker) | `pnpm vitest run src/tickets` | Integración de la migración M1 en tenant efímero | `rollback.sql` de M1; constantes y guardia sin consumidores externos |
| 2 | Motor hábil (`msHabilesEntre`, `sumarMsHabiles`, `tope`) y medidores | PR 2 (base PR1) | `pnpm vitest run src/calendario-laboral src/sla/domain` | N/A: dominio puro | Funciones nuevas; `venceAt` conserva su contrato |
| 3a | M2, schema, repo (`Omit`, `create`, `update`), snapshot, marcador con secuencia, evento | PR 3 (base PR2) | `pnpm vitest run src/tickets` | Integración: rollback de la tx, secuencias concurrentes, deriva Prisma/DDL | `rollback.sql` de M2; marcador sin listener |
| 3b | `RelojSla`, `ConsolidarRelojSlaUseCase`, repo del reloj, listener | PR 4 (base PR3) | `pnpm vitest run src/sla` | Integración del CAS y del pliegue por secuencia | Módulo SLA sin registrar el listener |
| 3c | `AplicarSla` con meta y derivado; barrido de pendientes y vencidos | PR 5 (base PR4) | `pnpm vitest run src/sla` | Integración del barrido | Cambios del UC y del barrido |
| 4 | Reanudación por comentario, mail de espera | PR 6 (base PR5) | `pnpm vitest run src/tickets src/notificaciones` | e2e: comentario del solicitante y mail | Listener, política y plantilla nuevos |
| 5 | M3 y meta "Primera respuesta (h)" por prioridad (BE y FE) | PR 7 (base PR6) | `pnpm vitest run src/catalogos` | Integración del CHECK `> 0` | `rollback.sql` de M3 |
| 6 | M4 con relleno, registro en tx, meta en `AplicarSla` | PR 8 (base PR7) | `pnpm vitest run src/tickets src/sla` | Integración del relleno (`EXPLAIN ANALYZE`) | `rollback.sql` de M4 |
| 7 | Barrido de primera respuesta, evento, plantilla, notificador común | PR 9 (base PR8) | `pnpm vitest run src/sla src/notificaciones` | e2e: barrido con mail único | Barrido, evento y notificador |
| 8 | Dashboard backend: tres métricas y abiertos en espera | PR 10 (base PR9) | `pnpm vitest run src/dashboard` | Integración con Postgres real | Repo y use case del dashboard |
| 9a | Estado derivado en el DTO, `ticket-header`, tipos | PR 11 (base PR10) | `pnpm vitest run src/tickets` y FE `pnpm test` | N/A: aserciones de unidad y msw | DTO y header |
| 9b | Espejo de arcos, badge, control de transición, tarjetas, roadmap | PR 12 (base PR11) | FE `pnpm test` | N/A: Testing Library + msw | Componentes del frontend |

## WU-1 — Estado ESPERANDO_CLIENTE, constantes y guardia (~300 líneas)

- [x] 1.1 Migración tenant M1 `…_estado_esperando_cliente` con `INSERT INTO estados … ('ESPERANDO_CLIENTE','Esperando al cliente',35,…) ON CONFLICT (codigo) DO NOTHING` y `rollback.sql` que mueve los tickets en espera a EN_PROCESO y borra la fila. (`ticket-esperando-cliente R1`)
- [x] 1.2 Sumar el estado al seeder `tenant-seeder.adapter.ts:80-87` para los tenants nuevos. (`ticket-esperando-cliente R1`)
- [x] 1.3 Test de integración: cliente existente con M1 y cliente nuevo tienen `ESPERANDO_CLIENTE` exactamente una vez; reaplicar M1 no lo duplica. (`ticket-esperando-cliente R1`)
- [x] 1.4 Test unit de la máquina: arcos EN_PROCESO→ESPERANDO_CLIENTE y ESPERANDO_CLIENTE→EN_PROCESO/RESUELTO/CANCELADO aceptados; NUEVO/ASIGNADO/RESUELTO→ESPERANDO_CLIENTE y ESPERANDO_CLIENTE→NUEVO/ASIGNADO/CERRADO rechazados. (`ticket-esperando-cliente R1`)
- [x] 1.5 Agregar a `tickets/domain/state-machine/estados.constants.ts` `ESTADOS_RELOJ_CORRE`, `ESTADOS_NO_DESTINO_CORRECTIVO = {ESPERANDO_CLIENTE}` y `afectaRelojSla(anterior, nuevo)`; extender los arcos de la máquina. (`ticket-esperando-cliente R1`, `sla-reloj-activo R1`)
- [x] 1.6 Test unit de `afectaRelojSla`: verdadero al cambiar corre/detenido o al ir a RESUELTO; falso en arcos NUEVO→ASIGNADO→EN_PROCESO. (`sla-reloj-activo R1`)
- [x] 1.7 Test unit de `TransicionarEstadoUseCase` (invariante "el salto lleva a ESPERANDO_CLIENTE"): ROOT/ADMINISTRADOR con salto a ESPERANDO_CLIENTE desde NUEVO, ASIGNADO o RESUELTO recibe `TransicionInvalidaError` (422) y el estado no cambia; el salto desde ESPERANDO_CLIENTE a ASIGNADO se acepta. (`ticket-esperando-cliente R2`)
- [x] 1.8 `TransicionarEstadoUseCase`: `saltoCorrectivo` exige además `!ESTADOS_NO_DESTINO_CORRECTIVO.has(destino)`. (`ticket-esperando-cliente R2`)
- [x] 1.9 Actualizar los 5 specs que cuentan 6 estados para que cuenten 7 (exploración §1.4).
- [x] 1.10 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/tickets src/catalogos`; raíz `node scripts/check-casts-en-specs.mjs`. Anotar deuda de Ayuda (estado nuevo) en commit y PR; avisar en el PR que M1 no se despliega sin las WU-3.

## WU-2 — Motor de tiempo hábil y medidores (~330 líneas)

- [x] 2.1 Test unit de `msHabilesEntre`: apertura incluida, cierre exclusivo, feriados, fin de semana, día cerrado, `hasta <= desde` da 0, tramo sin ventana abierta suma 0 sin lanzar, exceso de `LIMITE_DIAS_RANGO = 3_700` lanza. (`sla-reloj-activo R2`, `dashboard-metricas-sla R2`)
- [x] 2.2 Test unit de `sumarMsHabiles`: `ms = 0` devuelve `desde`, cruce de día/feriado/fin de semana, `LIMITE_DIAS_BUSQUEDA = 400` conservado; caso viernes 17:30 con cierre 18:00 y meta 2 h vence el día hábil siguiente 1 h 30 min después de la apertura. (`sla-primera-respuesta R3`)
- [x] 2.3 Test de regresión: los tests actuales de `venceAt` pasan sin cambios. (`sla-reloj-activo R2`)
- [x] 2.4 `calcular-sla-habil-vence.service.ts`: agregar `msHabilesEntre` y `sumarMsHabiles` sobre el núcleo privado; `venceAt(creadoEn, horas)` delega en `sumarMsHabiles(creadoEn, horas * 3_600_000)`; `buscarInicioVentanaAbierta` acepta `tope` opcional y devuelve `null` al pasarlo. (`sla-reloj-activo R2`)
- [x] 2.5 Test unit de los medidores: `MedidorHabil` usa calendario y feriados vigentes; `MedidorCorrido` usa tiempo de pared (48 h de pared = 48 h). (`sla-reloj-activo R9`)
- [x] 2.6 Crear `sla/domain` `MedidorTiempoSla { entre; sumar }`, `MedidorHabil` y `MedidorCorrido`. (`sla-reloj-activo R9`)
- [x] 2.7 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/calendario-laboral src/sla/domain`; raíz `node scripts/check-casts-en-specs.mjs`.

## WU-3a — M2, columnas del reloj, repo y marcador (~390 líneas)

- [x] 3a.1 Migración tenant M2 `…_tickets_reloj_sla` con las 7 columnas de `tickets` de ADR-1 (defaults en dos pasos: agregar NULL y luego `SET DEFAULT`), CHECKs `sla_acumulado_s IS NULL OR >= 0` y `sla_meta_s IS NULL OR > 0`, índice parcial `tickets_sla_reloj_pendiente_idx`, `operaciones_ticket.sla_reloj_seq` con su índice parcial, y `rollback.sql` (`DROP INDEX`, `DROP CONSTRAINT`, `DROP COLUMN`). (`sla-reloj-activo R7`)
- [x] 3a.2 Actualizar `prisma_tenant/schema.prisma` con los defaults de Prisma y un comentario contra la trampa de `sla_regla`.
- [x] 3a.3 Test de integración de M2: las filas existentes quedan con `sla_acumulado_s` y `sla_corre_desde` NULL (ticket previo), los defaults aplican a filas nuevas y los CHECK rechazan valores inválidos; sin recálculo de vencimientos ni cumplimientos. (`sla-reloj-activo R7`)
- [x] 3a.4 Test de deriva al estilo de `tickets-sla-regla.integration.spec.ts`: los defaults de Prisma y del DDL coinciden en las 5 columnas con default (`information_schema.columns.column_default`).
- [x] 3a.5 Medir con `EXPLAIN ANALYZE` en un tenant de prueba el índice parcial y el relleno de defaults de M2 antes del deploy; dejar el resultado en el PR.
- [x] 3a.6 Test de integración (invariante "`save` con lectura vieja"): cargar, consolidar, `save` deja `slaVenceAt` y `vencido` intactos. (`sla-reloj-activo R2`)
- [x] 3a.7 `PrismaTicketRepository.save`: rama `create` con `slaAcumuladoS: 0` y `slaCorreDesde = createdAt`; sacar de `toPersistence` las 7 columnas nuevas y también `slaVenceAt` y `vencido` de la rama `update`; ampliar el `Omit`. (`sla-reloj-activo R2`)
- [x] 3a.8 `RelojSlaSnapshot` de solo lectura en `ticket.entity.ts`, cargado por `toDomain`.
- [x] 3a.9 Declarar los puertos `IRelojSlaMarcador` y `IPrimeraRespuestaWriteRepository` en `tickets/domain/ports` y `TicketTransicionadoEvent` (`'ticket.transicionado'`).
- [x] 3a.10 Test de integración (invariante "el marcador queda fuera de la tx"): un rollback forzado de la tx no deja `sla_reloj_version` incrementada. (`sla-reloj-activo R4`)
- [x] 3a.11 Test de integración (invariante "secuencias repetidas o con huecos"): dos transiciones concurrentes sobre el mismo ticket dejan `seq` 1 y 2 y `sla_reloj_version = 2`. (`sla-reloj-activo R1`)
- [x] 3a.12 Test unit de `TransicionarEstadoUseCase`: marca y publica `ticket.transicionado` solo si `afectaRelojSla`; `AsignarYPonerEnProcesoUseCase` no marca y deja `sla_reloj_seq` NULL. (`sla-reloj-activo R1`) La asercion de DB de `AsignarYPonerEnProceso` esta en `asignar-y-poner-en-proceso.reloj-sla.integration.spec.ts` (WU-3a.4).
- [x] 3a.13 Implementar `IRelojSlaMarcador.marcar` en la infraestructura de `tickets` (`ticket.update` con `increment` y `operacionTicket.update` con `slaRelojSeq`) y llamarlo en `TransicionarEstadoUseCase` después de `save(ticket)` y `save(operacion)`; publicar el evento en `alCommitear`. (`sla-reloj-activo R1`)
- [x] 3a.14 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/tickets`; raíz `node scripts/check-casts-en-specs.mjs`. Nota de riesgo de presupuesto: ~390 líneas; si pasa de 400, partir la migración con su integración (3a.1 a 3a.5) de repo y marcador (3a.6 a 3a.13), cada mitad con sus tests.

## WU-3b — `RelojSla`, consolidación y listener (~300 líneas)

- [x] 3b.1 Test unit de `RelojSla.plegar` (invariante "pausa, reanudación y pausa con dos listeners caídos"): tres operaciones suman los tres tramos sin perder ninguno. (`sla-reloj-activo R1`)
- [x] 3b.2 Test unit: entrar a espera con 3 h hábiles activas deja acumulado 3 h y reloj detenido; toda salida (arco, comentario, salto a NUEVO o ASIGNADO) reanuda desde ese instante. (`sla-reloj-activo R1`)
- [x] 3b.3 Test unit: meta 8 h y 3 h activas, tras 2 días hábiles de espera el vencimiento queda 5 h hábiles después de la reanudación; pausa con SLA ya vencido no suma la semana detenida y conserva `min(slaVenceAt, inicioTramo)`; calendario vigente al reanudar. (`sla-reloj-activo R2`)
- [x] 3b.4 Test unit: cohorte `CORRIDO`, meta 24 h, 10 h activas, 48 h de pared en espera, vencimiento 14 h de pared tras la reanudación. (`sla-reloj-activo R9`)
- [x] 3b.5 Test unit del cumplimiento: meta 8 h, 5 h activas y 7 días de espera cumple; acumulado = meta cumple (mutación `<=` a `<` en rojo); 9 h sobre 8 h no cumple de inmediato; reapertura con 7 h + 2 h da 9 h y "no cumplió" (gana la última resolución); el tiempo en RESUELTO no suma; CERRADO no cambia el cumplimiento; preventivo (`meta` null) deja `cumplido` null. (`sla-reloj-activo R3`, `sla-reloj-activo R6`, `sla-reloj-activo R9`)
- [x] 3b.2b Test unit (invariante "el cursor se ordena por tiempo"): `t_i = max(created_at_i, t_{i-1}, corre_desde)`, sin tramos negativos. (`sla-reloj-activo R1`)
- [x] 3b.6 Test unit de incorporación de previos: `acumulado = 0`, `corre_desde = createdAt`, `meta = entre(createdAt, slaVenceAt)` (pared si `CORRIDO`; null sin vencimiento); se pliega primero el historial sin secuencia y después el que la tiene; el vencimiento no cambia; un previo RESUELTO→CERRADO no se incorpora. (`sla-reloj-activo R7`, `sla-reloj-activo R8`)
- [x] 3b.7 Crear `sla/domain` `RelojSla` (pliegue por secuencia, recorte monótono, incorporación de previos, elección de medidor por `slaRegla`, vencimiento derivado y cumplimiento) y `IRelojSlaRepository` (`leer`, `historialSinSecuencia`, `transicionesDesde`, `guardarSiVersion`, `findPendientes`). (`sla-reloj-activo R1`, `sla-reloj-activo R2`, `sla-reloj-activo R3`)
- [x] 3b.8 Test de integración (invariante "una transición entra durante el pliegue"): `guardarSiVersion` con versión vieja devuelve `false` y el ticket queda pendiente (`SLA_RELOJ_CONFLICTO`); repetir el pliegue sin operaciones nuevas es idempotente. (`sla-reloj-activo R4`)
- [x] 3b.9 Test de integración (mutación): ordenar por `created_at` en lugar de `sla_reloj_seq` pone en rojo el caso "transición A con `createdAt` anterior que comitea después del pliegue de B; el pliegue siguiente incluye A (`seq` de A > cursor)". (`sla-reloj-activo R1`)
- [x] 3b.10 Test unit de `ConsolidarRelojSlaUseCase`: carga calendario y feriados antes de leer, reintenta una vez el CAS y deja pendiente si vuelve a fallar. (`sla-reloj-activo R4`)
- [x] 3b.11 Implementar `ConsolidarRelojSlaUseCase`, `PrismaRelojSlaRepository` y `RelojSlaListener` (`@OnEvent('ticket.transicionado')`, log-and-swallow con `SLA_RELOJ_ERROR`); registrar en `SlaModule` sin ciclo con `TicketsModule`. (`sla-reloj-activo R1`, `sla-reloj-activo R4`)
- [x] 3b.12 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/sla`; raíz `node scripts/check-casts-en-specs.mjs`.

## WU-3c — `AplicarSla` con meta y barrido (~250 líneas)

- [x] 3c.1 Test unit de `AplicarSlaUseCase`: pliega lo pendiente primero; fija `sla_meta_s` (null para preventivos, sin `slaHoras` o con `slaActivo=false`); con el reloj corriendo deriva `slaVenceAt` con `meta − (acumulado + entre(corre_desde, ahora))`; en RESUELTO recalcula `sla_cumplido`. (`sla-reloj-activo R2`, `sla-reloj-activo R3`, `sla-reloj-activo R9`)
- [x] 3c.2 Test unit: repriorizar con 3 h acumuladas a una prioridad de 4 h deja 1 h hábil por correr y conserva las pausas; editar las horas de una prioridad no cambia la meta de un ticket existente (cumple con meta 8 h tras cambiar la prioridad a 4 h y resolver con 6 h). (`sla-reloj-activo R2`, `sla-reloj-activo R3`)
- [x] 3c.3 Test unit: un ticket previo pasa a espera o se repriorizó y se incorpora con su vencimiento V intacto; sin recálculo masivo por la migración. (`sla-reloj-activo R7`)
- [x] 3c.4 `AplicarSlaUseCase`: pliega, fija `sla_meta_s`, deriva `slaVenceAt` y recalcula `sla_cumplido`, todo con el CAS de versión; absorber `setSlaVenceAt`. (`sla-reloj-activo R2`, `sla-reloj-activo R3`, `sla-reloj-activo R7`)
- [x] 3c.5 Test unit de `MarcarVencidosUseCase`: un ticket en ESPERANDO_CLIENTE o RESUELTO con vencimiento pasado no se marca ni envía mail; EN_PROCESO vencido se marca y se notifica una vez; un pendiente no se marca (invariante "barrido sobre un pendiente"); una marca de vencido ya puesta permanece; el evento solo si el `updateMany` afectó 1 fila. (`sla-reloj-activo R4`)
- [x] 3c.6 Test de integración del barrido: reconcilia los `sla_reloj_pendiente` antes de evaluar (huérfano de pausa con dos listeners caídos: pausa, reanudación, pausa) y un ticket previo corriendo se marca por estado aunque `sla_corre_desde` sea NULL. (`sla-reloj-activo R4`, `sla-reloj-activo R7`)
- [x] 3c.7 `MarcarVencidosUseCase`: paso 1 reconcilia pendientes; paso 2 marca con `estado.codigo in ESTADOS_RELOJ_CORRE` y `slaRelojPendiente=false`. (`sla-reloj-activo R4`)
- [x] 3c.8 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/sla`; raíz `node scripts/check-casts-en-specs.mjs`.

## WU-4 — Reanudación por comentario y mail de espera (~230 líneas)

- [x] 4.1 Test unit de `ReanudarPorComentarioListener`: el solicitante comenta en público en ESPERANDO_CLIENTE y transiciona a EN_PROCESO con `actorEsCorrector: false` y el solicitante como autor; otro autor no reanuda; ticket en EN_PROCESO no genera transición; `TransicionInvalidaError` del segundo comentario concurrente se loguea y se ignora. (`ticket-esperando-cliente R3`)
- [x] 4.2 Test e2e (invariante "comentario interno"): un comentario interno del solicitante deja el ticket en ESPERANDO_CLIENTE y el reloj detenido; uno público lo pasa a EN_PROCESO con el cambio en el timeline. (`ticket-esperando-cliente R3`, `sla-reloj-activo R1`)
- [x] 4.3 `ReanudarPorComentarioListener` en `tickets/infrastructure` (`@OnEvent('ticket.comentado')`) y registro en `TicketsModule`. (`ticket-esperando-cliente R3`)
- [x] 4.4 Test unit: `estados-notificables.policy.ts` incluye ESPERANDO_CLIENTE; `templateEsperandoCliente` escapa HTML (`escaparHtml`) y omite el link para el externo. (`ticket-esperando-cliente R4`)
- [x] 4.5 Test unit de `TicketNotificacionListener`: elige `templateEsperandoCliente` al ir a ESPERANDO_CLIENTE; el SMTP que falla no revierte la transición y se registra; el solicitante externo sin correo no recibe y se loguea; la salida a EN_PROCESO no envía el mail de espera. (`ticket-esperando-cliente R4`)
- [x] 4.6 Test e2e con `overrideProvider(EMAIL_SENDER)`: EN_PROCESO→ESPERANDO_CLIENTE envía un mail al solicitante. (`ticket-esperando-cliente R4`)
- [x] 4.7 Implementar la política, la plantilla y la elección en `TicketNotificacionListener.onTicketEstadoCambiado`. (`ticket-esperando-cliente R4`)
- [x] 4.8 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/tickets src/notificaciones`; raíz `node scripts/check-casts-en-specs.mjs`.

## WU-5 — Meta "Primera respuesta (h)" por prioridad (~340 líneas)

- [x] 5.1 Migración tenant M3 `…_prioridades_primera_respuesta`: `sla_primera_respuesta_horas integer NULL` con CHECK `> 0` y `rollback.sql` (`DROP`); actualizar `schema.prisma`. (`sla-primera-respuesta R2`)
- [x] 5.2 Test de integración de M3: las prioridades existentes quedan sin meta; el CHECK rechaza 0 y negativos. (`sla-primera-respuesta R2`)
- [x] 5.3 Test unit de entidad, mapper, DTO y casos de uso de prioridad (crear y editar): 4 guarda 4 h, vacío guarda sin meta, 0 y negativo se rechazan en la API. (`sla-primera-respuesta R2`)
- [x] 5.4 Implementar entidad, mapper, DTO (`catalogo.dto.ts`) y casos de uso de `POST/PATCH /catalogos/prioridades`, sin cambio de permisos. (`sla-primera-respuesta R2`)
- [x] 5.5 Test FE del formulario y de la lista de prioridades: campo "Primera respuesta (h)" con Zod que espeja el DTO (vacío = sin meta, > 0). (`sla-primera-respuesta R2`)
- [x] 5.6 Campo en el formulario y columna en la lista del frontend. (`sla-primera-respuesta R2`)
- [x] 5.7 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/catalogos`; frontend `JWT_SECRET=dummy pnpm lint`, `pnpm type-check`, `pnpm test`; raíz `node scripts/check-casts-en-specs.mjs`. Anotar deuda de Ayuda (campo de prioridad) en commit y PR.

## WU-6 — M4, registro de la primera respuesta y meta en `AplicarSla` (~380 líneas)

- [x] 6.1 Migración tenant M4 `…_tickets_primera_respuesta`: 3 columnas (`primera_respuesta_at`, `primera_respuesta_vence_at`, `primera_respuesta_vencida` con `DEFAULT false` en los dos lados), índice parcial `WHERE primera_respuesta_at IS NULL AND NOT primera_respuesta_vencida AND primera_respuesta_vence_at IS NOT NULL`, relleno SQL (comentarios públicos, no borrados, autor distinto del solicitante o cualquier interno si es externo, `WHERE primera_respuesta_at IS NULL`) y `rollback.sql` (`DROP`). (`sla-primera-respuesta R5`)
- [x] 6.2 Test de integración del relleno: un comentario interno, uno público borrado y uno público de un técnico dan la fecha del primero; ninguna meta ni vencimiento retroactivos; reaplicar no cambia ninguna fecha. (`sla-primera-respuesta R5`)
- [x] 6.3 Medir con `EXPLAIN ANALYZE` el relleno sobre una copia de un tenant de prueba y contar los `COMENTARIO` por tenant; dejar ambos resultados en el PR. (`sla-primera-respuesta R5`)
- [x] 6.4 Test unit de `CrearComentarioUseCase`: comentario público de un técnico registra `primeraRespuestaAt` con la fecha de la operación; el interno, el del solicitante, la asignación y el cambio de estado no; solicitante externo registra con cualquier autor interno. (`sla-primera-respuesta R1`)
- [x] 6.5 Test de integración: dos comentarios públicos concurrentes dejan la fecha del primero (`registrarSiFalta` con `updateMany where primeraRespuestaAt: null`); un segundo comentario no cambia la fecha. (`sla-primera-respuesta R1`)
- [x] 6.6 Test de integración (invariante "borrado posterior"): borrar el comentario que registró la primera respuesta no cambia la fecha. (`sla-primera-respuesta R1`)
- [x] 6.7 `PrismaPrimeraRespuestaWriteRepository.registrarSiFalta` y su llamada en `CrearComentarioUseCase` dentro de `txRunner.run`. (`sla-primera-respuesta R1`)
- [x] 6.8 Test unit de `AplicarSlaUseCase`: fija `primera_respuesta_vence_at = sumarMsHabiles(createdAt, h * 3_600_000)` solo para `HABIL`, prioridad con meta y no preventivo; `slaActivo=false` no apaga la meta; preventivo y prioridad sin meta no tienen vencimiento; repriorizar reescribe con `where primeraRespuestaAt: null` y deja el ticket ya respondido igual; entrar a ESPERANDO_CLIENTE no corre el vencimiento. (`sla-primera-respuesta R3`, `sla-primera-respuesta R6`)
- [x] 6.9 `AplicarSlaUseCase`: fijar y reescribir `primera_respuesta_vence_at` según 6.8. (`sla-primera-respuesta R3`, `sla-primera-respuesta R6`)
- [x] 6.10 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/tickets src/sla`; raíz `node scripts/check-casts-en-specs.mjs`. Nota de riesgo de presupuesto: ~380 líneas; no partir el relleno SQL de su spec de integración.

## WU-7 — Barrido de primera respuesta y notificador común (~330 líneas)

- [x] 7.1 Test unit de `findPrimerasRespuestasVencidas` y del barrido: marca con CAS sobre `primeraRespuestaVencida=false` y publica `SlaPrimeraRespuestaVencidaEvent` solo si afectó 1 fila; no excluye ESPERANDO_CLIENTE; excluye con respuesta, RESUELTO, CERRADO, CANCELADO y borrados. (`sla-primera-respuesta R4`)
- [x] 7.2 Test de integración del repo: las condiciones de ADR-6 sobre Postgres real. (`sla-primera-respuesta R4`)
- [x] 7.3 Implementar `findPrimerasRespuestasVencidas(now)`, el paso 3 de `MarcarVencidosUseCase` y el evento `'sla.primera_respuesta_vencida'`. (`sla-primera-respuesta R4`)
- [x] 7.4 Test unit de `NotificadorVencimientoSla`: asignado más administradores deduplicados por email (sin repetir si un administrador es el asignado); el fallo de un destinatario no impide los demás; plantilla con `escaparHtml`. (`sla-primera-respuesta R4`)
- [x] 7.5 Extraer `NotificadorVencimientoSla` (`notificaciones/infrastructure`) de `SlaVencidoNotificacionListener:62-121` y migrar ese listener a la entrega común (corrige también su duplicado); crear el listener de primera respuesta con `templatePrimeraRespuestaVencida`. (`sla-primera-respuesta R4`)
- [x] 7.6 Test e2e con `overrideProvider(EMAIL_SENDER)`: dos barridos envían un solo mail al asignado y a cada administrador; un ticket en espera sin respuesta igual se notifica y se marca; la respuesta posterior al vencimiento cuenta como vencida; sin meta no hay mail. (`sla-primera-respuesta R4`, `sla-primera-respuesta R6`)
- [x] 7.7 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/sla src/notificaciones`; raíz `node scripts/check-casts-en-specs.mjs`.

## WU-8 — Dashboard backend (~360 líneas)

- [x] 8.1 Test de integración del cumplimiento de resolución: incorporados con `slaCumplido` (resuelto tarde antes del barrido cuenta como no cumplido; 5 h activas y 7 días de espera sobre meta de 8 h cuenta como cumplido) y previos con `fechaCierre <= slaVenceAt` (cerrado tarde sin marca cuenta como no cumplido); sin datos devuelve nulo. (`dashboard-metricas-sla R1`, `sla-reloj-activo R8`)
- [x] 8.2 Test de integración de primera respuesta: cuatro tickets con meta (dos a tiempo, uno tarde, uno sin respuesta y vencido) dan 50 %; el rellenado sin meta entra al tiempo medio y no al porcentaje; sin datos devuelve nulo. (`dashboard-metricas-sla R2`)
- [x] 8.3 Test unit del tiempo medio hábil: viernes 17:00 respondido lunes 10:00 (2 h) y viernes 17:00 respondido 17:30 (0,5 h) dan 1,25 h hábiles, no de pared. (`dashboard-metricas-sla R2`)
- [x] 8.4 Test de integración de preventivos: un preventivo resuelto con comentarios públicos de un técnico no altera ninguna de las tres métricas (filtro por `tipoId`). (`dashboard-metricas-sla R4`)
- [x] 8.5 Test de integración (invariante "estado de espera como abierto"): un ticket asignado en ESPERANDO_CLIENTE cuenta en `abiertos` y en `cargaPorAgente` y no en el cumplimiento de resolución. (`dashboard-metricas-sla R5`)
- [x] 8.6 `prisma-dashboard.repository.ts`: cuatro `count` en paralelo con field references de Prisma 7 (sin `$queryRaw`), primera respuesta con `lte: fields.primeraRespuestaVenceAt` y tiempo medio con `msHabilesEntre`, calendario vigente y feriados cargados una vez por consulta; `DashboardModule` importa `CalendarioLaboralModule`; payload aditivo. (`dashboard-metricas-sla R1`, `dashboard-metricas-sla R2`, `dashboard-metricas-sla R4`)
- [x] 8.7 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/dashboard` y **`pnpm test` completo** (última WU de backend); raíz `node scripts/check-casts-en-specs.mjs`. Anotar deuda de Ayuda (indicadores) en commit y PR.

## WU-9a — Estado SLA derivado en el DTO y header (~300 líneas)

- [x] 9a.1 Test unit de `derivarEstadoSla`: ESPERANDO_CLIENTE da `EN_PAUSA` sin fecha vigente; resuelto con `cumplido === false` da `VENCIDO` aunque no haya marca del barrido (previo: `fechaCierre > slaVenceAt`); con reloj corriendo (por `ESTADOS_RELOJ_CORRE`, nunca por `sla_corre_desde`) y `slaVenceAt < ahora` da `VENCIDO`; en otro caso `AL_DIA` o `SIN_SLA`. (`sla-reloj-activo R5`)
- [x] 9a.2 Test unit de `derivarEstadoPrimeraRespuesta`: `SIN_META`, `PENDIENTE`, `VENCIDA` sin respuesta pasado el vencimiento, `CUMPLIDA` con `at <= venceAt` y `VENCIDA` con respuesta tardía. (`sla-primera-respuesta R4`, `sla-primera-respuesta R6`)
- [x] 9a.3 Implementar ambas funciones en `tickets/domain` y el DTO `ticket.dto.ts:275` con `sla: {estado, venceAt}` y `primeraRespuesta: {estado, venceAt, at}`. (`sla-reloj-activo R5`, `sla-primera-respuesta R4`)
- [ ] 9a.4 Test FE de `ticket-header`: en pausa no muestra la fecha como vigente, resuelto tarde muestra vencido sin depender de `vencido`, badge de "primera respuesta vencida" y ausencia de badge para preventivo o sin meta. (`sla-reloj-activo R5`, `sla-primera-respuesta R4`, `sla-primera-respuesta R6`)
- [ ] 9a.5 `ticket-header.tsx` deja de leer `vencido` y usa los estados derivados; ampliar `types.ts`. (`sla-reloj-activo R5`, `sla-primera-respuesta R4`)
- [ ] 9a.6 Verificación: backend `pnpm lint`, `pnpm typecheck`, `pnpm vitest run src/tickets`; frontend `JWT_SECRET=dummy pnpm lint`, `pnpm type-check`, `pnpm test`; raíz `node scripts/check-casts-en-specs.mjs`.

## WU-9b — Frontend: arcos, badge, tarjetas y cierre del roadmap (~300 líneas)

- [ ] 9b.1 Test FE de `estado-transitions.ts`: arcos de ESPERANDO_CLIENTE espejados; `ESTADOS_CORRECTIVOS` (`features/tickets/lib/estado-transitions.ts:66`) no lista ESPERANDO_CLIENTE como destino correctivo y sí lo permite como origen. (`ticket-esperando-cliente R2`)
- [ ] 9b.2 Espejo de arcos y correctivos en `estado-transitions.ts`, `status-badge` y el control de transición. (`ticket-esperando-cliente R1`, `ticket-esperando-cliente R2`)
- [ ] 9b.3 Test FE de las tarjetas del dashboard: tres tarjetas con sus valores, y con datos nulos se lee "sin datos" y no 0 %. (`dashboard-metricas-sla R3`)
- [ ] 9b.4 Tarjetas de primera respuesta (% y tiempo medio) junto al cumplimiento de resolución. (`dashboard-metricas-sla R3`)
- [ ] 9b.5 Verificación: frontend `JWT_SECRET=dummy pnpm lint`, `pnpm type-check`, `pnpm test`; raíz `node scripts/check-casts-en-specs.mjs`. Anotar deuda de Ayuda (estado nuevo, regla de pausa, campo de prioridad, indicadores) en commit y PR.
- [ ] 9b.6 Cierre, DESPUÉS del deploy de la cadena completa: en `docs/roadmap-comercial.md` marcar el punto 6 como Entregado y declarar **Cumplida** o **Desviación** (con motivo) en la viñeta "Segunda etapa, punto 6"; correr `node scripts/check-roadmap-fresco.mjs`. La decisión pendiente de reapertura (tiempo extra o reloj nuevo) queda declarada como fuera de alcance.
- [ ] 9b.7 Notas de deploy en el PR del tracker: despliegue solo de la cadena completa; 4 migraciones tenant (M1, M2, M3, M4) por `migrate:tenants`, cada una con `rollback.sql`; `EXPLAIN ANALYZE` de M2 y M4 y conteo de `COMENTARIO` por tenant ya anotados; el lockfile no se espera que cambie; ninguna migración recalcula vencimientos ni cumplimientos.

## Cobertura de requerimientos (para verify)

- `ticket-esperando-cliente`: R1 (1.1-1.6, 9b.2), R2 (1.7-1.8, 9b.1-9b.2), R3 (4.1-4.3), R4 (4.4-4.7).
- `sla-reloj-activo`: R1 (1.5-1.6, 3a.11-3a.13, 3b.1-3b.2), R2 (2.4, 3b.3, 3c.1-3c.2), R3 (3b.5, 3c.1-3c.2), R4 (3b.8, 3c.5-3c.7), R5 (9a.1, 9a.4), R6 (3b.5), R7 (3a.1, 3b.6, 3c.3), R8 (3b.6, 8.1), R9 (2.5, 3b.4, 3c.1).
- `sla-primera-respuesta`: R1 (6.4-6.7), R2 (5.1-5.6), R3 (2.2, 6.8-6.9), R4 (7.1-7.6), R5 (6.1-6.3), R6 (6.8, 9a.2, 7.6).
- `dashboard-metricas-sla`: R1 (8.1, 8.6), R2 (8.2-8.3, 8.6), R3 (9b.3-9b.4), R4 (8.4), R5 (8.5).

## Review Workload Forecast (resumen por WU)

| WU | Líneas estimadas | Riesgo | Rama |
|----|------------------|--------|------|
| 1 | ~300 | Low | `feat/sla-primera-respuesta-y-pausa-wu01` |
| 2 | ~330 | Low | `feat/sla-primera-respuesta-y-pausa-wu02` |
| 3a | ~390 | Medium | `feat/sla-primera-respuesta-y-pausa-wu03a` |
| 3b | ~300 | Low | `feat/sla-primera-respuesta-y-pausa-wu03b` |
| 3c | ~250 | Low | `feat/sla-primera-respuesta-y-pausa-wu03c` |
| 4 | ~230 | Low | `feat/sla-primera-respuesta-y-pausa-wu04` |
| 5 | ~340 | Low | `feat/sla-primera-respuesta-y-pausa-wu05` |
| 6 | ~380 | Medium | `feat/sla-primera-respuesta-y-pausa-wu06` |
| 7 | ~330 | Low | `feat/sla-primera-respuesta-y-pausa-wu07` |
| 8 | ~360 | Low | `feat/sla-primera-respuesta-y-pausa-wu08` |
| 9a | ~300 | Low | `feat/sla-primera-respuesta-y-pausa-wu09a` |
| 9b | ~300 | Low | `feat/sla-primera-respuesta-y-pausa-wu09b` |
| Total | ~3.810 (el diseño anota ~3.820; diferencia de redondeo) | High | tracker `feat/sla-primera-respuesta-y-pausa` |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

Delivery: `auto-chain`, un PR por WU, cada uno ≤ 400 líneas. Ninguna WU requiere `size:exception` según el pronóstico: ninguna necesita separar código de los tests que lo prueban. Las WU-3a y WU-6 están cerca del tope; si una pasa de 400, se parte en una seam limpia (3a: migración e integración vs. repo y marcador) y solo se pide `size:exception` si partir separaría el código de su test (por ejemplo el relleno SQL de su integración en la WU-6), informándolo en el PR. Cada WU compila sola y se revierte con `git revert` en orden inverso.
