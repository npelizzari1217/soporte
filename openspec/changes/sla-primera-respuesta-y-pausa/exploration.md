# Exploracion: SLA de primera respuesta y pausa del reloj

Cambio: `sla-primera-respuesta-y-pausa`. Fecha: 2026-10-06. Decisiones de producto (confirmadas, no se reabren): `docs/roadmap-comercial.md`, seccion "Decisiones de producto de la segunda etapa", bullet "Segunda etapa, punto 6". Esas 10 vinetas pasan a requerimientos con escenario en la spec. Al cerrar el punto hay que declararlas "Cumplida" o "Desviacion" (`scripts/check-roadmap-fresco.mjs`).

> Persistido por el orquestador: el ejecutor de `sdd-explore` no tiene herramienta de escritura. Contenido tal como lo devolvio la fase, con una correccion (fecha de suspension de la Ayuda: 2026-09-07).

## 1. Estado actual (verificado)

### 1.1 Ticket y columnas SLA
- `backend/prisma_tenant/schema.prisma:267-333`: `slaVenceAt` (287), `vencido` (289, `@default(false)`), `slaRegla` (298, `@default("HABIL")` en Prisma, DDL `DEFAULT 'HABIL'`), `fechaCierre` (299, timestamptz). No hay ninguna columna de pausa ni de primera respuesta.
- `Prioridad` (84-102): `slaHoras Int?` y `slaActivo`. Es la unica fuente de la meta de resolucion. No hay meta de primera respuesta.
- `Estado` (54-70): `codigo @unique`, sin CHECK de codigos (init_tenant solo tiene CHECK en archivos, items_compra, presupuestos y ticket_edilicia). Se puede insertar un estado nuevo sin tocar constraints.
- `OperacionTicket` (382-410): `esInterno`, `autorId`, `estadoAnteriorId`/`estadoNuevoId`. El catalogo `tipo_operacion` tiene COMENTARIO y CAMBIO_ESTADO.

### 1.2 Calculo de vencimiento
- `calendario-laboral/domain/services/calcular-sla-habil-vence.service.ts:117-146`: solo existe `venceAt(creadoEn, horas, calendario, feriados)`. Consume ventanas `[apertura, cierre)` en hora argentina (UTC-3 fijo) y feriados como claves `YYYY-MM-DD`. `LIMITE_DIAS_BUSQUEDA = 400`. Cuando el vencimiento cae exactamente en el cierre de ventana, el cursor siguiente salta al dia habil proximo (lineas 177-182). No existe "tiempo habil entre dos instantes" ni "sumar tiempo habil a un instante" con milisegundos.
- `sla/domain/services/calcular-sla-vence.service.ts:23-28`: 24/7, `creadoEn + horas*3600000`.
- `AplicarSlaUseCase` (`sla/application/use-cases/aplicar-sla.use-case.ts`): `alCrear` (96-111) y `alReprioritizar` (124-142) calculan siempre desde `ticket.createdAt`. Cortan en preventivo (170-173) y sin `slaHoras` o `slaActivo=false` (176-179), escribiendo `null`. Elige calculador por `ticket.slaRegla` (193-202). No recalcula en estado terminal (131-133). RESUELTO no es terminal, asi que un resuelto si recalcula.
- `PrismaSlaTicketWriteRepository.setSlaVenceAt` (`prisma-sla-ticket-write.repository.ts:21-26`) solo escribe `slaVenceAt`. No toca `vencido`.
- Listener `AplicarSlaListener` (`sla/infrastructure/listeners/aplicar-sla.listener.ts:38-70`): `@OnEvent('ticket.creado'|'ticket.reprioritizado')`, log-and-swallow con `SLA_APLICAR_ERROR`.

### 1.3 Barrido y notificacion
- `SlaSweepScheduler` (`sla-sweep.scheduler.ts:39-59`): cron cada 5 min (`SLA_SWEEP_CRON`), por tenant dentro de `tenantContext.run()`, aislado por tenant.
- `PrismaSlaTicketQueryRepository.findVencibles` (`prisma-sla-ticket-query.repository.ts:21,31-42`): `slaVenceAt < now`, `vencido=false`, `estado.codigo NOT IN (RESUELTO, CERRADO, CANCELADO)`. `marcarVencido` es `updateMany WHERE vencido=false`.
- `MarcarVencidosUseCase` publica `SlaVencidoEvent` por ticket. `SlaVencidoNotificacionListener` (`notificaciones/infrastructure/listeners/sla-vencido-notificacion.listener.ts:60-102`) manda mail al asignado y a los administradores con `templateSlaVencido` (`email-templates.ts:84`). Aislado por destinatario.

### 1.4 Estados y transiciones
- Maquina en `tickets/domain/state-machine/base-ticket-state-machine.ts:19-25`: `NUEVO→ASIGNADO|CANCELADO`, `ASIGNADO→EN_PROCESO|CANCELADO`, `EN_PROCESO→RESUELTO|CANCELADO`, `RESUELTO→CERRADO`. Terminales CERRADO y CANCELADO (`estados.constants.ts:25`).
- `TransicionarEstadoUseCase` (`transicionar-estado.use-case.ts:98-208`): doble validacion (entidad + maquina), salto correctivo (138): `actorEsCorrector && destino no terminal` sin mirar el grafo, incluso desde terminales. `fechaCierre` se setea en RESUELTO **y** en CERRADO (29, 167-171) y se limpia al salir. La transaccion guarda ticket + operacion CAMBIO_ESTADO. El evento `TicketEstadoCambiadoEvent` solo sale si el destino es notificable (RESUELTO/CERRADO, `estados-notificables.policy.ts:12`).
- `TicketMapper.toPersistence` (`ticket.mapper.ts:68-88`) + `PrismaTicketRepository.save` (179-189) hacen upsert con TODAS las props de la entidad, incluidas `slaVenceAt` y `vencido`. `slaRegla` queda fuera a proposito.
- `ESTADOS_PRE_PROCESO` (NUEVO/ASIGNADO) gobierna la edicion: pasado EN_PROCESO solo ROOT edita (`editar-ticket.use-case.ts:69`). `ESPERANDO_CLIENTE` cae sola del lado "solo ROOT".
- Seeder `clientes/infrastructure/tenant-seeder.adapter.ts:80-87`: 6 estados con orden 10..60. Precedente de migracion para tenants existentes: `20260909120000_add_tipo_preventivo` (INSERT idempotente con `ON CONFLICT (codigo) DO NOTHING`).
- Specs que fijan "6 estados": `tenant-seeder.adapter.spec.ts:57`, `tenant-seeder.adapter.integration.spec.ts:194`, `base-ticket-state-machine.spec.ts`, `ticket-state-machine.factory.spec.ts:54`, `tickets.e2e.spec.ts:13`.
- Otros consumidores del conjunto "atendido": `ESTADOS_TICKET_ATENDIDO` en `prisma-preventivo-generacion.repository.ts:36` (NOT IN RESUELTO/CERRADO/CANCELADO, asi que `ESPERANDO_CLIENTE` cuenta como abierto, correcto). `ESTADOS_SIN_COMENTARIOS_PUBLICOS` en `crear-comentario.use-case.ts:23` (no incluye esperando, correcto: el solicitante debe poder comentar).

### 1.5 Comentarios
- `CrearComentarioUseCase` (`crear-comentario.use-case.ts:76-134`): escribe una `OperacionTicket` sin transaccion y publica `TicketComentadoEvent` solo si es publico. Controller `POST /tickets/:id/comentarios` (`tickets.controller.ts:623-649`), `autorId = user.sub`, permiso base `TICKETS:COMENTAR`. Un solicitante externo tiene `solicitanteId = null` (CHECK exactamente uno de los dos), asi que cualquier autor interno es "no solicitante".

### 1.6 Dashboard
- `PrismaDashboardRepository.cumplimientoSla` (`prisma-dashboard.repository.ts:101-114`): `fechaCierre != null`, `slaVenceAt != null`, y a tiempo = `vencido=false`. De ahi el falso "a tiempo" entre vencimiento y barrido. `tiempoPromedioResolucionHoras` es tiempo de pared (`fechaCierre - createdAt`) calculado en memoria (69-86). "Abiertos" = `fechaCierre IS NULL`.
- `ObtenerMetricasUseCase` (`dashboard/application/use-cases/obtener-metricas.use-case.ts:28-49`) arma `cumplimientoSla {cerradosConSla, cerradosATiempo, porcentaje}`. Frontend: `features/dashboard/lib/metricas-map.ts:70` (`toSlaPercentage`), `dashboard-view.tsx`, `types.ts`.
- Prisma `^7.10.0`: soporta field references (`fechaCierre: { lte: client.ticket.fields.slaVenceAt }`) sin `$queryRaw`.

### 1.7 Frontend
- `ticket-header.tsx:68-70,105-115`: badge "SLA vencido"/"SLA al dia" por `ticket.vencido`, y muestra "SLA vence" con `slaVenceAt`.
- `features/tickets/lib/estado-transitions.ts:8-13` (grafo espejo), `:66` (`ESTADOS_CORRECTIVOS`), `:59` (pre-proceso). `types.ts:13` (`TicketEstadoCodigo`). `components/ui/status-badge.tsx:8-10` (`TicketEstado` + config por estado). `ticket-transition-control.tsx`, `ticket-detail-view.tsx`.
- Prioridad: `catalogos/components/prioridad-form-dialog.tsx`, `prioridad-list.tsx`, `catalogos/schemas.ts`, `catalogos/types.ts`. Backend: `catalogo.dto.ts:98-202`, `prioridad.entity.ts`, `prioridad.mapper.ts`, `crear/editar-prioridad.use-case.ts`.

### 1.8 Restricciones de ciclos previos
- Horario laboral por cliente (D11): guardar calendario o feriados no recalcula tickets abiertos. Por coherencia, una pausa usa el calendario vigente al reanudar.
- sla-habil: los tickets existentes no se recalculan (cohorte `CORRIDO`).

## 2. Hallazgos que cambian el diseno

1. **Reprioritizar pierde la pausa.** `alReprioritizar` recalcula desde `createdAt`. Con un corrimiento aplicado solo a `slaVenceAt`, la primera repriorizacion borra el efecto de todas las pausas anteriores. Hay que acumular la pausa y reaplicarla en el recalculo.
2. **Carrera de `save()`.** El upsert completo pisa columnas con la lectura vieja de la entidad (ya pasa hoy con `vencido`, si el barrido corre entre `findById` y `save`). Las columnas SLA nuevas no deben ir en el upsert de la entidad, salvo el marcador de pausa que escribe la propia transicion.
3. **`fechaCierre` se sobrescribe en CERRADO.** `ESTADOS_QUE_CIERRAN` incluye CERRADO, entonces RESUELTO→CERRADO reemplaza la fecha de resolucion por la de cierre. Comparar `fechaCierre` con `slaVenceAt` (decision confirmada) penaliza un cierre administrativo tardio de un ticket resuelto a tiempo. Los tickets historicos ya quedaron asi y no se pueden reconstruir salvo desde `operaciones_ticket`.
4. **Salto correctivo + `ESPERANDO_CLIENTE`.** Hoy el salto lleva a cualquier no terminal, incluso desde CERRADO. Sin guardia, un corrector podria mandar un ticket NUEVO o reabierto directo a esperando. Hay que sacar el estado de los destinos correctivos (backend y `ESTADOS_CORRECTIVOS`). Y a la inversa, **cualquier salida** de esperando (arco normal o salto) debe reanudar el reloj.
5. **`vencido` sticky y badges.** El badge del header depende de `vencido`, que solo marca el barrido. Un ticket resuelto tarde pero antes del barrido muestra "SLA al dia". Conviene derivar el estado SLA efectivo en el DTO, no en el frontend.
6. **Vencimiento ya vencido al pausar.** Hay hasta 5 min de retraso del barrido: un ticket puede entrar a esperando con `slaVenceAt < ahora` y `vencido=false`. Si al reanudar se corre el vencimiento, se "perdona" un incumplimiento ya ocurrido.
7. **Cohorte CORRIDO.** El corrimiento debe ser por tiempo de pared (24/7) para `CORRIDO` y por tiempo habil para `HABIL`. Las metas de primera respuesta solo existen para tickets nuevos, que son siempre `HABIL`.
8. **Orden de unidades de tiempo.** Sumar tiempo habil a un `slaVenceAt` es seguro: el vencimiento siempre cae en una ventana abierta o justo en su cierre, y el motor lo maneja (el cierre es exclusivo y salta al dia siguiente).

## 3. Opciones por decision

### 3.1 Estado `ESPERANDO_CLIENTE`
- Fila nueva en `estados`: codigo `ESPERANDO_CLIENTE`, nombre "Esperando al cliente", `orden 35` (entre EN_PROCESO=30 y RESUELTO=40, sin reordenar).
- Arcos: `EN_PROCESO→ESPERANDO_CLIENTE`, `ESPERANDO_CLIENTE→EN_PROCESO|RESUELTO|CANCELADO`.
- Cambios: migracion tenant (INSERT idempotente) + seeder + constante de dominio + maquina + espejo `estado-transitions.ts` + `status-badge` + `TicketEstadoCodigo`. Actualizar los 5 specs que cuentan 6 estados.
- Anadir `ESPERANDO_CLIENTE` a `ESTADOS_EXCLUIDOS_VENCIMIENTO` del barrido (el de resolucion). `ESTADOS_TICKET_ATENDIDO` y `ESTADOS_SIN_COMENTARIOS_PUBLICOS` quedan igual.
- `asignar-y-poner-en-proceso` ya rechaza esperando por `CAMINO_HASTA_EN_PROCESO` (devuelve `TransicionInvalidaError`).

### 3.2 Modelo de pausa

| Opcion | Descripcion | Pros | Contras |
|---|---|---|---|
| A. Solo corrimiento al reanudar | Guardar `sla_pausado_desde`; al volver, `slaVenceAt += horas habiles pausadas` | Una columna; mapea literal a la decision | Repriorizar recalcula desde `createdAt` y pierde las pausas previas; sin historial |
| **B. Corrimiento + acumulado** | A, mas `sla_pausa_acumulada_s` (suma de lo corrido). Repriorizar: `venceAt(createdAt, horas*3600 + acumulado)` | Repriorizar correcto, auditable, simple de testear | Dos columnas; elegir la unidad (segundos en `Int`, evita el tope de ~24 dias de ms en int4) |
| C. Derivar todo del historial | Reconstruir pausas desde `operaciones_ticket` CAMBIO_ESTADO | Cero columnas | Fragil (saltos, ediciones, soft delete), costoso en cada calculo |

Recomendacion: **B**. Segundos en `Int` con DEFAULT 0 NOT NULL: el `@default(0)` de Prisma y el DEFAULT del DDL coinciden, asi que no hay trampa como la de `sla_regla`. Aun asi, el spec debe fijar los dos y un test de deriva.

Regla de corrimiento al reanudar (`pausado_desde = P`, reanudacion = `R`):
- Si `slaVenceAt` es null (preventivo, sin SLA): solo limpiar el marcador.
- Si `P >= slaVenceAt` (ya estaba vencido): corrimiento 0. No se perdona un incumplimiento.
- Si no: `delta` = tiempo habil entre `P` y `R` (HABIL) o `R - P` (CORRIDO); `slaVenceAt = sumarHabil(slaVenceAt, delta)` (o suma directa para CORRIDO); `acumulado += delta`.
- Siempre: `sla_pausado_desde = null`.
- Aproximacion aceptada: mover el vencimiento por el tiempo habil pausado equivale a "guardar lo que falta al pausar y retomarlo al volver", porque el tiempo habil es aditivo para un mismo calendario.

Servicio de dominio nuevo, en `calcular-sla-habil-vence.service.ts` (o servicio hermano): `horasHabilesEntre(desde, hasta, calendario, feriados): number` (ms) y una variante `sumarMsHabiles(desde, ms, ...)`, refactorizando el nucleo de `venceAt` para reutilizarlo. Cuidar la entrada fraccionaria (`horas*3600000`): redondear a ms enteros. Mismos limites (`LIMITE_DIAS_BUSQUEDA`).

### 3.3 Donde engancha pausa/reanudacion

| Opcion | Pros | Contras |
|---|---|---|
| 1. Listener del modulo SLA sobre un evento nuevo de transicion | Respeta el patron actual (ADR-P8): tickets no depende de calendario; todo el calculo SLA queda en `sla/` | Post-commit, log-and-swallow: un fallo deja el vencimiento sin correr |
| 2. Dentro de `TransicionarEstadoUseCase`, en la transaccion | Atomico | `tickets` pasaria a depender de calendario y feriados (MASTER); rompe la separacion de modulos |
| **3. Hibrido** | La transicion escribe en su propia transaccion solo `sla_pausado_desde` (un timestamp, sin calendario); el listener SLA calcula el corrimiento al reanudar; el barrido reconcilia huerfanos | Atomico donde importa; el calculo queda en `sla/`; se auto-repara. Contra: un evento nuevo mas una rama en el barrido |

Recomendacion: **3**. El marcador entra y sale con la transaccion de la transicion (la entidad lo lleva como prop, o un repo acotado en la misma tx, ver hallazgo 2). El evento nuevo (por ejemplo `ticket.transicionado` con `estadoAnteriorCodigo`/`estadoNuevoCodigo`, publicado para TODAS las transiciones, o dos eventos `ticket.pausado`/`ticket.reanudado`) lo consume `PausarReanudarSlaUseCase` en el modulo SLA. Auto-reparacion: el barrido busca tickets con `sla_pausado_desde NOT NULL` y estado distinto de esperando, y les aplica el corrimiento. No hace falta una tabla de outbox.

### 3.4 Reanudacion automatica por comentario del solicitante

| Opcion | Pros | Contras |
|---|---|---|
| a. Dentro de `CrearComentarioUseCase` | Comentario y transicion consistentes | Acopla comentarios a transiciones; el use case hoy no usa transaccion |
| **b. Listener de `ticket.comentado`** | Mismo patron de eventos; reutiliza el use case de transicion como "sistema" con autor = solicitante, por el arco normal `ESPERANDO→EN_PROCESO` | Eventual: un fallo deja el ticket esperando |

Recomendacion: **b**, con condicion: `autorId === ticket.solicitanteId`, comentario publico (el evento solo sale para publicos) y estado actual `ESPERANDO_CLIENTE`. Crea una operacion CAMBIO_ESTADO real con el solicitante como autor, que deja rastro en el timeline. Un solicitante externo no puede comentar (sin login), asi que no aplica. El listener dispara la transicion, que a su vez dispara el evento de reanudacion: esos eventos deben ser idempotentes (la reanudacion solo actua si `sla_pausado_desde` no es null).

Resolver desde `TicketsModule` (donde viven transicion y comentarios), no desde `sla/`, para no crear una dependencia circular `sla ⇄ tickets` (hoy `SlaModule` importa `TicketsModule`).

### 3.5 Primera respuesta: almacenamiento y registro

Columnas nuevas en `tickets`:
- `primera_respuesta_vence_at timestamptz NULL` (la meta; NULL = sin meta).
- `primera_respuesta_at timestamptz NULL` (cuando ocurrio).
- `primera_respuesta_vencida boolean NOT NULL DEFAULT false` (sticky, solo para deduplicar el mail y marcar desde el barrido).

Y en `prioridades`: `sla_primera_respuesta_horas Int NULL` con `CHECK (... IS NULL OR ... > 0)`, igual que `sla_horas`.

Donde registrar `primera_respuesta_at`:

| Opcion | Pros | Contras |
|---|---|---|
| **a. En `CrearComentarioUseCase`** | Inmediato y sin carrera de eventos | Un paso mas en un use case de una sola escritura |
| b. Listener de `ticket.comentado` | Desacoplado | Eventual |

Recomendacion: **a**, con una escritura acotada y condicional: `updateMany({ where: { id, primeraRespuestaAt: null }, data: { primeraRespuestaAt: operacion.createdAt } })`. Condiciones: comentario publico, `autorId != ticket.solicitanteId`, ticket no soft-deleted. La condicion `WHERE ... IS NULL` hace la operacion idempotente y evita la carrera de comentarios concurrentes. Va por un repo acotado (puerto nuevo o ampliar `ISlaTicketWriteRepository`), **no** por `ticketRepo.save`.

Cuenta como respuesta solo el comentario: ni la asignacion, ni un cambio de estado, ni un adjunto. Las respuestas predefinidas pasan por el mismo comentario, asi que cuentan.

Calculo de la meta: en `AplicarSlaUseCase.alCrear` (y `alReprioritizar` mientras `primera_respuesta_at IS NULL`), calendario habil del cliente, anclada en `createdAt`, sin pausa. Si la prioridad no tiene meta o es preventivo: NULL. Solo para `slaRegla = 'HABIL'`.

Estado derivado (en el DTO, sin depender del sticky): vencida = `primeraRespuestaAt == null && primeraRespuestaVenceAt < ahora` o `primeraRespuestaAt > primeraRespuestaVenceAt`.

### 3.6 Backfill de tickets existentes

La decision: no recalcular metas, pero si completar **cuando** hubo primera respuesta.

| Opcion | Pros | Contras |
|---|---|---|
| **SQL en la migracion tenant** | Una sola pasada por tenant, sin codigo de aplicacion, reversible con otra migracion; mismo patron que `add_sla_regla_tickets` | Un UPDATE correlacionado sobre tickets historicos |
| Script aparte | Controlable | Hay que recordar correrlo en cada tenant: se olvida |

Recomendacion: SQL en la migracion. Esquema:

```sql
UPDATE tickets t SET primera_respuesta_at = sub.primera
FROM (
  SELECT o.ticket_id, MIN(o.created_at) AS primera
  FROM operaciones_ticket o
  JOIN tipo_operacion top ON top.id = o.tipo_operacion_id AND top.codigo = 'COMENTARIO'
  JOIN tickets tt ON tt.id = o.ticket_id
  WHERE o.es_interno = false AND o.deleted_at IS NULL
    AND (tt.solicitante_id IS NULL OR o.autor_id <> tt.solicitante_id)
  GROUP BY o.ticket_id
) sub
WHERE t.id = sub.ticket_id AND t.primera_respuesta_at IS NULL;
```

Seguridad: idempotente por la condicion `IS NULL`; no toca `primera_respuesta_vence_at` (sin meta retroactiva, no entran en el cumplimiento); `operaciones_ticket` tiene indice en `ticket_id`; corre dentro del `migrate deploy` transaccional. Verificar antes en un tenant de prueba el costo (EXPLAIN) y el nombre de `tipo_operacion` (`schema.prisma:174`). Productores de COMENTARIO verificados: el controller de tickets (reparaciones usa su propia tabla). Confirmar con una consulta de conteo por tenant.

### 3.7 Barrido y notificacion de primera respuesta

- Segundo criterio en `ISlaTicketQueryRepository`: `findPrimerasRespuestasVencidas(now)`: `primeraRespuestaVenceAt < now`, `primeraRespuestaAt IS NULL`, `primeraRespuestaVencida=false`, estado NOT IN (RESUELTO, CERRADO, CANCELADO). **No** excluye `ESPERANDO_CLIENTE` (la primera respuesta no se pausa).
- Evento `SlaPrimeraRespuestaVencidaEvent`, plantilla `templatePrimeraRespuestaVencida` y listener nuevo en `notificaciones`, mismos destinatarios que el de resolucion (asignado y administradores). Conviene factorizar la entrega comun en vez de copiar el listener actual.
- El mismo barrido: `MarcarVencidosUseCase` ejecuta ambos pasos con el mismo aislamiento por ticket.

### 3.8 Dashboard

- Cumplimiento de resolucion: pasar de `vencido=false` a `fechaCierre <= slaVenceAt` con field references de Prisma 7. Se mantiene el universo (`fechaCierre != null`, `slaVenceAt != null`, preventivos excluidos porque tienen `slaVenceAt` null). Atencion al hallazgo 3.
- Cumplimiento de primera respuesta: universo = tickets con `primeraRespuestaVenceAt != null` que respondieron o ya vencieron; cumplido = `primeraRespuestaAt <= primeraRespuestaVenceAt`. `porcentaje = cumplidos / universo`, null si el universo es 0 (mismo contrato).
- Tiempo medio de primera respuesta: promedio de `primeraRespuestaAt - createdAt` sobre todos los que tienen `primeraRespuestaAt` (incluye los rellenados). Unidad: ver pregunta abierta 3.
- Payload: nuevas claves `cumplimientoPrimeraRespuesta {conMeta, aTiempo, porcentaje}` y `tiempoPromedioPrimeraRespuestaHoras`. Cambio aditivo del contrato: `features/dashboard/types.ts`, `metricas-map.ts`, `dashboard-view.tsx`, `metricas.dto.ts`, `i-dashboard.repository.ts` y los specs de integracion de `prisma-dashboard`.
- `cargaPorAgente` y `abiertos` no cambian: un ticket esperando tiene `fechaCierre` null y sigue contando como abierto del agente.

### 3.9 Notificacion al solicitante (no decidido)
Hoy el solicitante se entera de RESUELTO y CERRADO (`estados-notificables.policy.ts`). Entrar a "Esperando al cliente" no notifica, y el estado existe justamente para pedirle algo. Opcion barata: agregar `ESPERANDO_CLIENTE` a la politica y una plantilla. No esta en las 10 decisiones: pregunta abierta 1.

## 4. Inventario de migracion por tenant

Una migracion nueva en `backend/prisma_tenant/migrations/` (precedente: `20260909130000_add_sla_regla_tickets`):
1. `INSERT INTO estados (...) VALUES (gen_random_uuid(), 'ESPERANDO_CLIENTE', 'Esperando al cliente', 35, true, now(), now()) ON CONFLICT (codigo) DO NOTHING`.
2. `ALTER TABLE tickets ADD COLUMN sla_pausado_desde timestamptz NULL`, `sla_pausa_acumulada_s integer NOT NULL DEFAULT 0`, `primera_respuesta_vence_at timestamptz NULL`, `primera_respuesta_at timestamptz NULL`, `primera_respuesta_vencida boolean NOT NULL DEFAULT false`.
3. `ALTER TABLE prioridades ADD COLUMN sla_primera_respuesta_horas integer NULL` + `CHECK (... IS NULL OR ... > 0)` (nombre estilo `prioridades_sla_primera_respuesta_horas_check`).
4. Relleno de `primera_respuesta_at` (3.6). Indices parciales para los dos barridos: `WHERE primera_respuesta_at IS NULL AND primera_respuesta_vence_at IS NOT NULL` y `WHERE sla_pausado_desde IS NOT NULL`.
5. Seeder: sumar el estado al arreglo `ESTADOS` (80-87) para tenants nuevos (el INSERT de migracion cubre los existentes: las dos fuentes, como en preventivo).
6. `schema.prisma`: las columnas nuevas. DEFAULTs: `sla_pausa_acumulada_s` y `primera_respuesta_vencida` coinciden en Prisma y DDL; documentarlo en el schema para no repetir la deriva de `sla_regla`. Test de deriva estilo `tickets-sla-regla.integration.spec.ts`.
7. No hay CHECK sobre `estados.codigo` que mantener. Las prioridades existentes quedan con `sla_primera_respuesta_horas` NULL (sin meta): consistente con "sin recalculo".

Mapper y entidad: `sla_pausado_desde` entra al upsert solo si se decide llevarlo en la entidad (3.3, opcion 3); el resto de las columnas nuevas queda **fuera** de `toPersistence` y se escribe por repos acotados (hallazgo 2).

## 5. Superficies afectadas

Backend: `tickets/domain/state-machine/{base-ticket-state-machine,estados.constants}.ts`, `tickets/application/use-cases/{transicionar-estado,crear-comentario}.use-case.ts`, `ticket.entity.ts` / `ticket.mapper.ts` (solo si se lleva el marcador), `ticket.dto.ts` (campos derivados), listener de auto-reanudacion en `TicketsModule`, `sla/` (use case de pausa, query/write repos, sweep, `AplicarSlaUseCase`), `calendario-laboral/domain/services/` (tiempo habil), `notificaciones/` (listener, plantilla, politica opcional), `dashboard/`, `catalogo.dto.ts` + prioridad entity/mapper/use cases, `clientes/infrastructure/tenant-seeder.adapter.ts`, `prisma_tenant/`.

Frontend: `estado-transitions.ts` (arcos, correctivos sin esperando), `types.ts`, `status-badge.tsx`, `ticket-transition-control.tsx` (etiqueta del nuevo destino), `ticket-header.tsx` (badges "SLA en pausa" y primera respuesta; el "SLA vence" mientras esta en pausa debe mostrarse como pausado, no como fecha), `prioridad-form-dialog.tsx` + `schemas.ts` (campo "Primera respuesta (h)", vacio = sin meta) + `prioridad-list.tsx` + `types.ts`, dashboard (2 metricas). Filtros por estado: los lee del catalogo, no hay lista fija, pero verificar el listado de tickets.

Ayuda (`backend/ayuda/*.md`): suspendida desde el 2026-09-07 segun `CLAUDE.md`. Anotar la deuda en commits y PR (nuevo estado, nuevo campo de prioridad, nuevos indicadores, regla de pausa). Corregir cualquier articulo existente que quede falso (por ejemplo el de estados de ticket o el de SLA, si existen).

## 6. Riesgos

1. **Falso verde por pausa perdida**: repriorizar recalcula desde `createdAt` (hallazgo 1). Mitigado con el acumulado.
2. **Carrera del upsert** de la entidad (hallazgo 2): decidir temprano que columnas van fuera de `toPersistence`.
3. **`vencido` sticky**: un ticket ya marcado vencido que se pausa y reanuda no recupera `false`. Con la regla `P >= slaVenceAt → delta 0` es coherente; el spec debe declararlo. Si el ticket no estaba vencido y la pausa lo salva, el barrido no lo marco nunca: correcto.
4. **Salto correctivo desde terminal**: reabrir un CERRADO/CANCELADO con salto a EN_PROCESO deja `slaVenceAt` en el pasado y `vencido` posiblemente true (preexistente). Bloquear `ESPERANDO_CLIENTE` como destino correctivo (hallazgo 4).
5. **Salida por salto a NUEVO/ASIGNADO/RESUELTO** desde esperando: debe reanudar igual. El evento de reanudacion debe salir de toda transicion cuyo estado anterior sea esperando.
6. **Edicion de calendario o feriados durante la pausa**: el corrimiento usa el calendario vigente al reanudar (coherente con D11). Documentarlo, no resolverlo.
7. **Zona horaria**: Argentina es UTC-3 fijo; todo instante es UTC real. Mantener la disciplina de `desplazarAArgentina` solo para leer componentes locales en el nuevo `horasHabilesEntre`.
8. **`fechaCierre` en CERRADO** (hallazgo 3): requiere decision del dueno. Opciones: (i) dejar como esta y documentar el sesgo; (ii) no sobrescribir `fechaCierre` en RESUELTO→CERRADO (cambia tambien el promedio de resolucion y las exportaciones, y no corrige el historico); (iii) medir contra la primera fecha de RESUELTO sacada de `operaciones_ticket`. Recomendado: (i) en este ciclo, explicitado en la spec, y (ii) como cambio aparte.
9. **Eventos eventuales** (listeners post-commit): fallos silenciosos. Mitigacion: marcador transaccional + reconciliacion en el barrido (3.3) y log `SLA_PAUSA_ERROR` por `ILogger`.
10. **Primera respuesta sobre tickets en esperando**: un ticket puede pasar a esperando sin respuesta publica. La meta sigue corriendo, como pide la decision.
11. **Repriorizar con meta de primera respuesta**: si ya hubo primera respuesta no recalcular la meta (queda historica).
12. **Tests de integracion**: los specs que truncan `soporte_master_test` deben llamar `usarLockMasterTest()`. Los tenants efimeros se limpian en orden: filas, `app.close()`, `dropDatabase`.
13. **TDD**: el cambio es feature, modo estandar. El item del dashboard (falso "a tiempo") es defecto de comportamiento: si se separa como cambio propio, aplica la inyeccion de TDD estricto de la seccion 6.3 del `CLAUDE.md` raiz.

## 7. Estimacion (presupuesto de 400 lineas por PR)

| WU | Alcance | Lineas aprox. |
|---|---|---|
| WU-1 | Migracion (estado + columnas + CHECK + indices), `schema.prisma`, seeder, constantes, maquina de estados, espejo frontend (`estado-transitions`, `status-badge`, `types`), guardia del salto correctivo, specs de "6 estados" | 300-380 |
| WU-2 | Dominio: `horasHabilesEntre` y suma de ms habiles, con tests (feriados, ventanas, cruce de dias) | 250-350 |
| WU-3 | Pausa y reanudacion: marcador transaccional, evento, `PausarReanudarSlaUseCase`, acumulado, repriorizacion con acumulado, exclusion en el barrido, reconciliacion de huerfanos | 380-450 (partir en 3a y 3b si pasa de 400) |
| WU-4 | Auto-reanudacion por comentario del solicitante (listener en `TicketsModule`) | 150-220 |
| WU-5 | Meta de prioridad: columna, entidad, mapper, DTO, use cases, form y lista frontend | 300-380 |
| WU-6 | Registro de primera respuesta (`CrearComentarioUseCase` + repo acotado) + calculo de la meta en `AplicarSla` + relleno SQL | 300-400 |
| WU-7 | Barrido de primera respuesta + evento + plantilla + listener (factorizando lo comun) | 250-350 |
| WU-8 | Dashboard backend: cumplimiento por comparacion de fechas + 2 metricas nuevas + specs de integracion | 250-350 |
| WU-9 | Frontend: header (badges y estado SLA derivado), DTO de ticket, dashboard (2 tarjetas), tests | 300-400 |

Total: 9 work units, ~2.500-3.300 lineas con tests. WU-1 y WU-2 son independientes. WU-3 depende de ambas; WU-4 de WU-3; WU-6 de WU-5; WU-7 de WU-6; WU-8 y WU-9 dependen del resto. Rama+PR por unidad y deuda de Ayuda anotada en cada PR.

## 8. Preguntas abiertas para el dueno (las decisiones confirmadas no se tocan)

1. **Notificar al solicitante** al entrar a "Esperando al cliente" (hoy solo se notifica RESUELTO y CERRADO).
2. **`fechaCierre` en RESUELTO→CERRADO**: confirmar que el cumplimiento compara contra la fecha del ultimo cierre (con el sesgo conocido), o medir contra la primera resolucion (hallazgo 3).
3. **Unidad del tiempo medio de primera respuesta**: tiempo de pared (consistente con el promedio de resolucion actual y barato) u horas habiles (mas fiel al SLA, requiere calendario y feriados por ticket al leer).
4. **Pausa ya vencida**: confirmar que un ticket que entra a esperando despues de vencer su SLA no recupera tiempo al reanudar (regla `P >= slaVenceAt → sin corrimiento`).
5. **Destino correctivo**: confirmar que ROOT/ADMINISTRADOR no pueden saltar a "Esperando al cliente" (solo entra por el arco desde En proceso).

## 9. Recomendacion final por eleccion tecnica

| Eleccion | Recomendacion |
|---|---|
| Modelo de pausa | **B**: `sla_pausado_desde` + `sla_pausa_acumulada_s` (Int segundos); corrimiento al reanudar |
| Corrimiento CORRIDO vs HABIL | Pared para CORRIDO, habil para HABIL; sin corrimiento si ya estaba vencido al pausar |
| Enganche de pausa/reanudacion | **Hibrido**: marcador en la tx de la transicion; calculo en listener del modulo SLA; reconciliacion en el barrido |
| Auto-reanudacion | Listener de `ticket.comentado` en `TicketsModule`, transicion por arco normal con autor = solicitante |
| Almacenamiento primera respuesta | Tres columnas en `tickets` + una en `prioridades`; fuera de `toPersistence` |
| Registro de primera respuesta | En `CrearComentarioUseCase`, con `updateMany ... WHERE primera_respuesta_at IS NULL` |
| Relleno | SQL en la migracion tenant, idempotente, sin meta retroactiva |
| Estado SLA mostrado | Derivar en el DTO (`AL_DIA`/`VENCIDO`/`EN_PAUSA` y primera respuesta), no leer el sticky |
| Dashboard | Field references de Prisma 7, sin `$queryRaw`; payload aditivo |
| `fechaCierre` en CERRADO | Dejar y documentar en este ciclo; cambio aparte si el dueno quiere corregirlo |

## Listo para propuesta

Si, tras responder las 5 preguntas. Las 10 decisiones del roadmap se citan por ruta en la spec y cada una se convierte en requerimiento con escenario; cualquier desviacion se declara explicitamente antes de empezar.
