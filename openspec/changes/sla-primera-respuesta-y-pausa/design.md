# Design: SLA de primera respuesta y pausa del reloj

## Technical Approach

Enfoque de la propuesta: reloj de resolución por **tiempo activo**, enganche **híbrido**
(marcador dentro de la transacción de la transición, cálculo en `sla/`, reconciliación en el
barrido) y primera respuesta registrada en `CrearComentarioUseCase`. Decisión de producto:
`docs/roadmap-comercial.md`, "Segunda etapa, punto 6" (commit 0b3ac5ec). Specs que cubre:
`ticket-esperando-cliente`, `sla-reloj-activo`, `sla-primera-respuesta`, `dashboard-metricas-sla`.

Se reutilizan cuatro moldes del repo sin cambiarlos de forma:

1. **Núcleo hábil** de `CalcularSlaHabilVenceService` (`calendario-laboral/domain/services/calcular-sla-habil-vence.service.ts:117-146`).
2. **Escritura acotada** de columnas SLA (`PrismaSlaTicketWriteRepository`, ADR-P4), nunca por el upsert de la entidad.
3. **Post-commit** con `ITenantTransactionRunner.alCommitear` y listeners log-and-swallow (ADR-6).
4. **Barrido por tenant** de `SlaSweepScheduler` con aislamiento por ticket.

La pieza nueva es el **pliegue del reloj**: un objeto de dominio puro, `RelojSla`, que avanza el
estado del reloj recorriendo las operaciones `CAMBIO_ESTADO` posteriores a un cursor. La
transacción de la transición no calcula nada: solo deja el marcador (ADR-3).

---

## Capa donde cae cada pieza (`rules.design`)

| Pieza | Capa | Por qué |
|---|---|---|
| `msHabilesEntre`, `sumarMsHabiles` (en `CalcularSlaHabilVenceService`) | domain (`calendario-laboral`) | Aritmética pura de calendario; reutiliza el núcleo privado de `venceAt` |
| `MedidorTiempoSla` + `MedidorHabil` / `MedidorCorrido`, `RelojSla` (pliegue, vencimiento derivado, cumplimiento) | domain (`sla/domain`) | Reglas del reloj sin Prisma ni Nest; la cohorte elige el medidor |
| `ESTADOS_RELOJ_CORRE`, `afectaRelojSla(anterior, nuevo)`, `ESTADOS_NO_DESTINO_CORRECTIVO`, `derivarEstadoSla`, `derivarEstadoPrimeraRespuesta` | domain (`tickets/domain`) | Fuente única de qué estado corre y del estado mostrado; `sla/` ya importa de `tickets/domain` |
| `IRelojSlaMarcador`, `IPrimeraRespuestaWriteRepository` | domain (puertos de `tickets`) | La transición y el comentario escriben columnas SLA sin depender de `sla/` |
| `IRelojSlaRepository` (lectura de reloj y transiciones, escritura CAS) | domain (puerto de `sla`) | Contrato sin tipos de Prisma |
| `ConsolidarRelojSlaUseCase`, `AplicarSlaUseCase` (ampliado), `MarcarVencidosUseCase` (ampliado) | application (`sla`) | Orquestación; la regla vive en `RelojSla` |
| `ReanudarPorComentarioListener` | infrastructure (`tickets`) | Adaptador `@OnEvent`; delega en `TransicionarEstadoUseCase` |
| Repos Prisma, listeners, `NotificadorVencimientoSla` (entrega común) | infrastructure | Único lugar con Prisma, `TenantContext` y `IEmailSender` |
| `ticket.dto.ts` (campos derivados), `catalogo.dto.ts` (meta nueva) | interface | Traducen, sin lógica: la derivación es la función de dominio |

**Fuente única** (`rules.specs`):

- **Estados en los que corre el reloj**: `ESTADOS_RELOJ_CORRE` (`tickets/domain/state-machine/estados.constants.ts`). La consumen el pliegue, el barrido y el DTO.
- **Destino correctivo prohibido**: `ESTADOS_NO_DESTINO_CORRECTIVO = {ESPERANDO_CLIENTE}` en el mismo archivo. El frontend la espeja en `ESTADOS_CORRECTIVOS` (`features/tickets/lib/estado-transitions.ts:66`).
- **Meta de primera respuesta > 0**: el DTO del backend; la copian el Zod del frontend y el CHECK `prioridades_sla_primera_respuesta_horas_check`.

### Autorización: los dos lugares donde vive

| Ruta | Borde | Inline |
|---|---|---|
| `PATCH /tickets/:id/estado` (salto a ESPERANDO_CLIENTE) | Guards y permisos existentes del controller | `TransicionarEstadoUseCase`: `saltoCorrectivo` exige además `!ESTADOS_NO_DESTINO_CORRECTIVO.has(destino)`; sin eso responde `TransicionInvalidaError` (422) |
| `POST /tickets/:id/comentarios` (reanudación automática) | `TICKETS:COMENTAR` (`tickets.controller.ts:623-649`) | El listener exige `event.autorId === ticket.solicitanteId` y estado ESPERANDO_CLIENTE, y transiciona con `actorEsCorrector: false`: solo por el arco normal |
| `POST/PATCH /catalogos/prioridades` (meta nueva) | Permisos actuales del ABM de catálogos | Validación del DTO; sin cambio de permisos |

---

## Architecture Decisions

### ADR-1: modelo de datos del reloj activo

Columnas nuevas en `tickets` (migración M2, WU-3a):

| Columna | Tipo | DDL | Prisma | Significado |
|---|---|---|---|---|
| `sla_acumulado_s` | `integer NULL` | se agrega NULL y luego `SET DEFAULT 0` | `Int? @default(0)` | Segundos activos consolidados. **NULL = ticket previo, todavía no incorporado** |
| `sla_meta_s` | `integer NULL` | sin default | `Int?` | Meta de resolución en segundos, fotografiada al crear o repriorizar |
| `sla_corre_desde` | `timestamptz NULL` | NULL, luego `SET DEFAULT now()` | `DateTime? @default(now())` | Inicio del tramo activo; NULL = reloj detenido |
| `sla_reloj_seq_hasta` | `integer NOT NULL DEFAULT 0` | igual | `Int @default(0)` | Cursor: última secuencia de transición plegada (ADR-3) |
| `sla_reloj_version` | `integer NOT NULL DEFAULT 0` | igual | `Int @default(0)` | Secuencia por ticket: la incrementa cada transición marcada, bajo el lock de la fila (ADR-3); también es el guard del CAS del pliegue |
| `sla_reloj_pendiente` | `boolean NOT NULL DEFAULT false` | igual | `Boolean @default(false)` | Hay transiciones sin plegar |
| `sla_cumplido` | `boolean NULL` | sin default | `Boolean?` | Cumplimiento fijado en la última resolución |

| Opción | Tradeoff | Decisión |
|---|---|---|
| Milisegundos en `bigint` | Prisma lo devuelve como `BigInt`; contamina tipos | Rechazada |
| Segundos en `integer` | Tope de 68 años; redondeo por tramo ≤ 0,5 s | **Elegida** |
| Default 0 al agregar la columna | Rellena las filas existentes con 0: el ticket previo deja de distinguirse | Rechazada |
| Agregar NULL y después `SET DEFAULT` | Filas existentes en NULL (previas); filas nuevas nacen incorporadas | **Elegida** |

- **Columna nueva en `operaciones_ticket`**: `sla_reloj_seq integer NULL`, con un índice parcial
  `(ticket_id, sla_reloj_seq) WHERE sla_reloj_seq IS NOT NULL`. La escribe solo el marcador (ADR-3).
- **Semántica de los NULL** (fuente única, la aplican el pliegue, el barrido y el DTO):
  - **Si el reloj corre lo decide siempre** `estadoCodigo ∈ ESTADOS_RELOJ_CORRE`, **nunca** si
    `sla_corre_desde` es NULL. `sla_corre_desde` solo da el inicio del tramo de un ticket
    incorporado, y en un ticket previo es NULL aunque esté corriendo.
  - **`sla_acumulado_s IS NULL` es la ÚNICA prueba de ticket previo.** Ninguna otra columna se usa
    para decidirlo.
  - **`sla_meta_s` NULL** en un ticket incorporado significa "sin meta de resolución": preventivo,
    prioridad sin `slaHoras` o con `slaActivo=false`, o ticket previo incorporado sin vencimiento.
    En un ticket previo todavía no incorporado no significa nada: la meta se calcula al
    incorporarlo (ADR-4).
- **Paridad de defaults**: los defaults de Prisma y del DDL coinciden en las 5 columnas de `tickets` que los
  tienen, y lo comprueba un test de deriva al estilo de `tickets-sla-regla.integration.spec.ts`
  (`information_schema.columns.column_default`), con un comentario en `schema.prisma` para no
  repetir la trampa de `sla_regla`.
- **Alta**: `PrismaTicketRepository.save` (`prisma-ticket.repository.ts:179-189`) agrega a la rama
  `create` `slaAcumuladoS: 0` y `slaCorreDesde` igual a `createdAt`. Los defaults del DDL son la red
  para cualquier otro INSERT.
- **Fuera de `toPersistence`**: las 7 columnas nuevas de `tickets`, y **también `slaVenceAt` y `vencido`**, que
  salen de la rama `update` (hallazgo 2). La entidad nunca muta esas dos (`ticket.entity.ts:189`),
  así que un `save` con lectura vieja ya no pisa lo que escribió el SLA. El tipo de retorno de
  `toPersistence` amplía su `Omit`. La entidad recibe un `RelojSlaSnapshot` de solo lectura
  (lo carga `toDomain`) para que el DTO derive el estado.
- **CHECK**: `sla_acumulado_s IS NULL OR sla_acumulado_s >= 0`, `sla_meta_s IS NULL OR sla_meta_s > 0`.
- **Índice parcial**: `tickets_sla_reloj_pendiente_idx ON tickets (id) WHERE sla_reloj_pendiente`.

### ADR-2: motor de tiempo hábil

Dos funciones públicas nuevas en `CalcularSlaHabilVenceService`, sobre el mismo núcleo:

- `msHabilesEntre(desde, hasta, calendario, feriados): number`: si `hasta <= desde`, devuelve 0.
  Recorre ventanas `[apertura, cierre)` y suma `min(cierre, hasta) − cursor`.
- `sumarMsHabiles(desde, ms, calendario, feriados): Date`: `ms` es un entero mayor o igual que 0.
  Con 0 devuelve `desde`. `venceAt(creadoEn, horas)` pasa a ser `sumarMsHabiles(creadoEn, horas * 3_600_000)`,
  y sus tests actuales no cambian.
- `buscarInicioVentanaAbierta` acepta un `tope` opcional y devuelve `null` al pasarlo. Así, un tramo
  sin ninguna ventana abierta (calendario cerrado, feriados) suma 0 en lugar de lanzar.
- **Límites**: `sumarMsHabiles` conserva `LIMITE_DIAS_BUSQUEDA = 400`. `msHabilesEntre` acota su
  recorrido a `LIMITE_DIAS_RANGO = 3_700` días y lanza si se excede.
- **Cohorte**: `MedidorTiempoSla { entre(a, b): ms; sumar(a, ms): Date }`.
  - `MedidorHabil` envuelve el servicio con el calendario y los feriados vigentes.
  - `MedidorCorrido` usa tiempo de pared.
  - `RelojSla` elige el medidor por `slaRegla`.
- **Redondeo**: cada tramo se convierte con `Math.round(ms / 1000)`. La meta es `slaHoras * 3600`,
  que es exacta.
- **Calendario**: se usa el **vigente** al plegar, igual que D11 (`2026-09-29-horario-laboral-por-cliente/design.md`).
  La zona horaria es UTC-3 fija (D17).

### ADR-3: enganche híbrido con el registro de operaciones como fuente del pliegue

| Opción | Tradeoff | Decisión |
|---|---|---|
| Calcular dentro de la transacción | `tickets` pasaría a leer el calendario y los feriados de MASTER dentro de la tx del tenant: una caída de MASTER bloquea las transiciones | Rechazada |
| Marcador "pausado desde" y cálculo en el listener | Si fallan dos listeners seguidos (pausa, reanudación, pausa), un solo marcador pierde tramos | Rechazada |
| **La tx marca y `sla/` pliega las operaciones `CAMBIO_ESTADO` posteriores al cursor** | No pierde nada: la operación ya se escribe atómica en la misma tx y es inmutable (no existe un caso de uso que edite o borre un `CAMBIO_ESTADO`) | **Elegida** |

1. **Dentro de la tx** de `TransicionarEstadoUseCase`, solo si `afectaRelojSla(anterior, nuevo)` es
   verdadero, se llama a `IRelojSlaMarcador.marcar(ticketId, operacionId)` **después** de
   `ticketRepo.save(ticket)` y de `operacionRepo.save(operacion)`. `afectaRelojSla` es verdadero
   cuando cambia la categoría corre/detenido o cuando el destino es RESUELTO. El marcador hace dos
   escrituras:
   - `ticket.update({ where: { id }, data: { slaRelojVersion: { increment: 1 }, slaRelojPendiente: true }, select: { slaRelojVersion: true } })`,
     que devuelve la versión nueva `n`;
   - `operacionTicket.update({ where: { id: operacionId }, data: { slaRelojSeq: n } })`.

   **Orden por secuencia, no por tiempo.** `operaciones_ticket.created_at` sale de
   `OperacionTicketEntity.createdAt` (`operacion-ticket.mapper.ts:52`), un `new Date()` de la app
   tomado **antes** de que la tx tome el lock. Una transición que arrancó antes pero comitea después
   de un pliegue exitoso dejaría una operación más vieja que un cursor por tiempo, y su tramo no se
   plegaría nunca.

   | Opción | Tradeoff | Decisión |
   |---|---|---|
   | `clock_timestamp()` en la operación, después de `save(ticket)` | Hay que sacar `createdAt` del INSERT de la entidad y releerlo; el orden sigue dependiendo del reloj, y dos transiciones en el mismo microsegundo quedan empatadas | Rechazada |
   | **Secuencia por ticket (`sla_reloj_version`) estampada en la operación bajo el lock de la fila** | Entero estrictamente creciente y sin empates: el `save(ticket)` ya tomó el lock de la fila, y el incremento corre bajo ese lock. Además es el mismo número que guarda el CAS | **Elegida** |

   El tiempo de cada tramo sigue saliendo de `created_at`, recortado para que sea monótono:
   `t_i = max(created_at_i, t_{i-1}, corre_desde)`. Un tramo nunca es negativo.
   - `AsignarYPonerEnProcesoUseCase` solo recorre arcos en los que el reloj sigue corriendo, así que
     no marca, y sus operaciones quedan con `sla_reloj_seq` en NULL.
   - `AsignarYPonerEnProcesoUseCase` solo recorre arcos en los que el reloj sigue corriendo, así que
     no marca.
2. **Post-commit** (`txRunner.alCommitear`), se publica `TicketTransicionadoEvent`
   (`'ticket.transicionado'`, con `ticketId`, `estadoAnteriorCodigo` y `estadoNuevoCodigo`) **solo si
   se marcó**. `TicketEstadoCambiadoEvent` no cambia: sigue siendo el de notificaciones.
3. **`RelojSlaListener`** (`sla/infrastructure/listeners`) llama a `ConsolidarRelojSlaUseCase.execute(ticketId)`.
   Ante un error, loguea `SLA_RELOJ_ERROR` y no lo propaga.
4. **El pliegue**:
   1. Carga el calendario y los feriados **antes** de leer; ninguna lectura de MASTER queda dentro
      de una tx.
   2. Lee la fila (versión `v`) y las operaciones `CAMBIO_ESTADO` con
      `sla_reloj_seq > sla_reloj_seq_hasta`, ordenadas por `sla_reloj_seq`. Al incorporar un ticket
      previo, antes lee su historial sin secuencia (`sla_reloj_seq IS NULL`), ordenado por
      `created_at, id`. Ese historial es anterior al cambio o está hecho de arcos en los que el reloj
      sigue corriendo, así que su orden no altera el pliegue.
   3. `RelojSla.plegar(...)` recorre esas operaciones:
      - Al pasar de corre a detenido: `acumulado += entre(corre_desde, t)` y `corre_desde = null`.
      - Al pasar de detenido a corre: `corre_desde = t`, y se anota que hubo una reanudación.
      - Al entrar a RESUELTO: `cumplido = meta == null ? null : acumulado <= meta`.
      - Al volver a corre desde RESUELTO: `cumplido = null`.
   4. Al final, el estado del reloj se ajusta al estado **actual** del ticket: corre si
      `estadoCodigo ∈ ESTADOS_RELOJ_CORRE` (ADR-1).
   5. Escribe con `updateMany({ where: { id, slaRelojVersion: v }, data: {..., slaRelojSeqHasta: v, slaRelojPendiente: false } })`.
      Si afecta 0 filas, entró otra transición: se reintenta una vez y, si vuelve a fallar, queda
      pendiente para el barrido (`SLA_RELOJ_CONFLICTO`).
5. **Idempotencia**: repetir el pliegue sin operaciones nuevas no cambia nada.
6. **Sin ciclo de módulos**: `SlaModule` ya importa `TicketsModule`. `tickets` solo declara el puerto
   del marcador y lo implementa en su propia infraestructura, y nunca importa `SlaModule`.

### ADR-4: vencimiento derivado, barrido, cumplimiento y reapertura

- **Vencimiento derivado**: `restante = meta − acumulado`.
  - Si `restante > 0`: `slaVenceAt = sumar(inicioTramo, restante)`.
  - Si no: `slaVenceAt = min(slaVenceAt actual, inicioTramo)`. Conserva cuándo se superó la meta:
    "la pausa siempre descuenta" y nunca perdona un exceso.
- **Cuándo se reescribe `slaVenceAt`**:
  - en el pliegue, solo si termina corriendo **y** hubo una reanudación dentro de él;
  - en `AplicarSlaUseCase`, al crear o repriorizar.

  Un arco en el que el reloj sigue corriendo nunca lo toca, igual que D11.
- **`AplicarSlaUseCase`**:
  1. Pliega primero lo pendiente.
  2. Fija `sla_meta_s` (null para preventivos, sin `slaHoras` o con `slaActivo=false`).
  3. Con el reloj corriendo, deriva `slaVenceAt` desde ahora con `meta − (acumulado + entre(corre_desde, ahora))`.
  4. Si el ticket está en RESUELTO, recalcula `sla_cumplido`.

  Todo se escribe con el mismo CAS de versión. `setSlaVenceAt` queda absorbido.
- **Barrido** (`MarcarVencidosUseCase`), en tres pasos por tenant:
  1. Reconcilia los `sla_reloj_pendiente`. Es el caso del huérfano de `sla-reloj-activo` R4.
  2. Marca vencidos con `slaVenceAt < now`, `vencido=false` y `slaRelojPendiente=false`, en estado
     corriendo: `estado: { codigo: { in: [...ESTADOS_RELOJ_CORRE] } }`, la fuente única, no una lista
     NOT IN. El estado cubre también a los tickets previos, que corren de forma implícita. Publica el
     evento solo si el `updateMany` afectó 1 fila.
  3. Barre la primera respuesta (ADR-6).

  La exclusión de los pendientes evita marcar con un `slaVenceAt` viejo a un ticket recién reanudado.
- **`vencido`** queda como deduplicador del mail. Lo que se muestra se deriva (ADR-8).
- **Reapertura** (RESUELTO a corre, por salto): el reloj se reanuda con el acumulado que tenía y el
  vencimiento se deriva. El tiempo en RESUELTO no suma.
- **Tickets previos** (`sla_acumulado_s IS NULL`): se incorporan en el primer pliegue o en
  `AplicarSla`, con este estado inicial:
  - `acumulado = 0`;
  - `corre_desde = createdAt` y cursor `0`;
  - `meta = entre(createdAt, slaVenceAt)` (de pared si es `CORRIDO`; null si no hay vencimiento).

  Después se pliega **todo** su historial: primero lo que no tiene secuencia y después lo que sí
  (ADR-3). Antes del cambio no existía la espera, así que el resultado es "todo el tiempo sin
  resolver fue activo", y con esa meta el vencimiento queda igual (`sla-reloj-activo` R7).
  - Un previo que pasa de RESUELTO a CERRADO no marca, así que nunca se incorpora y sigue con
    `fechaCierre <= slaVenceAt` (`sla-reloj-activo` R8).
- **Preventivos**: tienen `meta` en null, y por lo tanto `slaVenceAt` y `cumplido` también en null.
  Las columnas de acumulado quedan inertes (`sla-reloj-activo` R9).

### ADR-5: reanudación por comentario y mail al solicitante

- **Reanudación**: `ReanudarPorComentarioListener` vive en `TicketsModule` y escucha `@OnEvent('ticket.comentado')`.
  - Se apoya en que `TicketComentadoEvent` se emite **solo para comentarios públicos**
    (`ticket-comentado.event.ts:5-8` y `crear-comentario.use-case.ts:116`). Por eso un comentario
    interno nunca reanuda (`ticket-esperando-cliente` R3), y lo comprueba un test: un comentario
    interno del solicitante deja el ticket en ESPERANDO_CLIENTE.
  - Recarga el ticket y exige estado ESPERANDO_CLIENTE y `autorId === solicitanteId`.
  - Llama a `TransicionarEstadoUseCase` hacia EN_PROCESO con `autorId` = solicitante y
    `actorEsCorrector: false`. Queda un `CAMBIO_ESTADO` real en el timeline y el reloj se reanuda
    por la vía de ADR-3.
  - Si llegan dos comentarios concurrentes, el segundo recibe `TransicionInvalidaError`: se loguea y
    se ignora.
  - Un solicitante externo no comenta (no tiene sesión), así que no aplica.
- **Mail al solicitante**: ESPERANDO_CLIENTE se agrega a `estados-notificables.policy.ts`.
  - `TicketNotificacionListener.onTicketEstadoCambiado` elige `templateEsperandoCliente` cuando el
    destino es ese estado, con `escaparHtml` y `sinLink` para el externo.
  - El listener de CSAT filtra CERRADO por su cuenta, así que no lo afecta.
  - Si el contacto no tiene correo, se loguea y no se envía (`ticket-esperando-cliente` R4).

### ADR-6: primera respuesta

- **Registro**: en `CrearComentarioUseCase`, dentro de `txRunner.run`, junto con la operación.
  - Si el comentario es público y `autorId !== ticket.solicitanteId`, se llama a
    `IPrimeraRespuestaWriteRepository.registrarSiFalta(id, operacion.createdAt)`:
    `updateMany where { id, primeraRespuestaAt: null }`.
  - Es idempotente y resiste la concurrencia. Un externo tiene `solicitanteId = null`, así que
    cualquier autor interno cuenta (`sla-primera-respuesta` R1).
  - **Borrado posterior**: si el comentario que registró la primera respuesta se borra (soft delete)
    después, `primeraRespuestaAt` **conserva** la fecha registrada. La respuesta ocurrió, y no se
    recalcula.
- **Meta**: `AplicarSlaUseCase` fija `primera_respuesta_vence_at = sumarMsHabiles(createdAt, h * 3_600_000)`.
  - Solo para `HABIL`, prioridad con meta (`slaPrimeraRespuestaHoras` no nulo) y no preventivo
    (`sla-primera-respuesta` R2, R6).
  - **`slaActivo` no interviene**: solo un valor vacío significa sin meta. `slaActivo` sigue
    gobernando únicamente la resolución, como hoy (`aplicar-sla.use-case.ts:176`).
  - Al repriorizar, se reescribe con `where primeraRespuestaAt: null`. No tiene pausa.
- **Barrido**: `findPrimerasRespuestasVencidas(now)`.
  - Condiciones: `primeraRespuestaVenceAt < now`, `primeraRespuestaAt` y `deletedAt` nulos,
    `primeraRespuestaVencida=false` y estado NOT IN (RESUELTO, CERRADO, CANCELADO). Sin excluir la
    espera (`sla-primera-respuesta` R3, R4).
  - Marca con un CAS sobre `primeraRespuestaVencida=false` y publica `SlaPrimeraRespuestaVencidaEvent`
    (`'sla.primera_respuesta_vencida'`) solo si afectó 1 fila.
- **Notificación**: `NotificadorVencimientoSla` (`notificaciones/infrastructure`) factoriza la entrega
  de `SlaVencidoNotificacionListener:62-121`: asignado más administradores, **deduplicados por
  email** (`sla-primera-respuesta` R4) y aislados por destinatario.
  - Los dos listeners le pasan su plantilla (`templateSlaVencido` y `templatePrimeraRespuestaVencida`).
  - La deduplicación también corrige al listener actual.

### ADR-7: dashboard

- **Cumplimiento de resolución**: cuatro `count` en paralelo, con field references de Prisma 7 y sin
  `$queryRaw`.
  - Incorporados: `fechaCierre != null`, `slaAcumuladoS != null`, `slaCumplido != null`; a tiempo,
    `slaCumplido = true`.
  - Previos: `fechaCierre != null`, `slaAcumuladoS = null`, `slaVenceAt != null`; a tiempo,
    `fechaCierre: { lte: client.ticket.fields.slaVenceAt }`.
  - Un incorporado con `cumplido` todavía nulo (pliegue pendiente) queda afuera hasta el siguiente
    barrido.
- **Cumplimiento de primera respuesta**:
  - universo: `primeraRespuestaVenceAt != null` y que haya respondido o vencido;
  - a tiempo: `primeraRespuestaAt: { lte: fields.primeraRespuestaVenceAt }`.
- **Tiempo medio**: horas hábiles por fila, con `msHabilesEntre(createdAt, primeraRespuestaAt)`, el
  calendario vigente y feriados cargados una vez por consulta.
  - `DashboardModule` importa `CalendarioLaboralModule`, que no genera ciclo.
  - Se rechazó guardar la duración: el relleno SQL no puede calcular horas hábiles.
- Preventivos excluidos por `tipoId`, el mismo filtro para las tres métricas. El payload crece de
  forma aditiva.
- **Tickets en espera** (`dashboard-metricas-sla` R5): `abiertos` y `cargaPorAgente` no cambian
  (`prisma-dashboard.repository.ts:63,91`). Un ticket en ESPERANDO_CLIENTE tiene `fechaCierre IS NULL`,
  así que cuenta como abierto y como carga, y no entra al cumplimiento de resolución. Lo comprueba un
  spec de integración en la WU-8.

### ADR-8: estado SLA derivado en el DTO

`derivarEstadoSla(snapshot, estadoCodigo, ahora)` devuelve `SIN_SLA | AL_DIA | EN_PAUSA | VENCIDO`:

- ESPERANDO_CLIENTE da `EN_PAUSA`.
- Un ticket resuelto devuelve `VENCIDO` si `cumplido === false` (para los previos, `fechaCierre > slaVenceAt`).
- Con el reloj corriendo (`estadoCodigo ∈ ESTADOS_RELOJ_CORRE`, nunca por `sla_corre_desde`),
  devuelve `VENCIDO` si `slaVenceAt < ahora`.

`derivarEstadoPrimeraRespuesta` devuelve `SIN_META | PENDIENTE | CUMPLIDA | VENCIDA`:

- sin `primeraRespuestaVenceAt`, `SIN_META`;
- sin respuesta, `VENCIDA` si `venceAt < ahora` y `PENDIENTE` en otro caso;
- con respuesta, `CUMPLIDA` si `at <= venceAt` y `VENCIDA` si `at > venceAt`. Una respuesta tardía
  cuenta como vencida (`sla-primera-respuesta` R4).

El DTO
(`ticket.dto.ts:275`) suma `sla: {estado, venceAt}` y `primeraRespuesta: {estado, venceAt, at}`.
`ticket-header.tsx` deja de leer `vencido`, y en pausa no muestra la fecha como vigente.

---

## Data Flow

```
PATCH estado ─ TransicionarEstado ─ tx{ save(lock fila) + op CAMBIO_ESTADO + marcar: version=n, op.seq=n, pendiente }
   └ alCommitear: ticket.transicionado ─ RelojSlaListener ─ ConsolidarRelojSla
        calendario/feriados ─ leer(v) + ops seq>cursor ─ RelojSla.plegar ─ updateMany(version=v, cursor=v)
   └ ticket.estado_cambiado (si notificable) ─ mail solicitante (ESPERANDO: plantilla propia)
POST comentario ─ CrearComentario ─ tx{ op + registrarSiFalta(primeraRespuestaAt) }
   └ ticket.comentado ─ ReanudarPorComentario (solicitante, en espera) ─ TransicionarEstado → EN_PROCESO
Barrido 5 min/tenant ─ reconciliar pendientes ─ marcar vencidos (corre, no pendiente)
   └ primera respuesta vencida ─ sla.primera_respuesta_vencida ─ NotificadorVencimientoSla
```

---

## Interfaces / Contracts

```ts
// sla/domain/ports/i-reloj-sla.repository.ts
export interface IRelojSlaRepository {
  leer(ticketId: string): Promise<RelojSlaFila | null>;          // incluye version, estadoCodigo, slaRegla
  historialSinSecuencia(ticketId: string): Promise<TransicionPlegable[]>;   // solo al incorporar un previo
  transicionesDesde(ticketId: string, seqCursor: number): Promise<TransicionPlegable[]>; // ORDER BY sla_reloj_seq
  guardarSiVersion(ticketId: string, version: number, cambios: CambiosRelojSla): Promise<boolean>;
  findPendientes(): Promise<string[]>;
}
// tickets/domain/ports
export interface IRelojSlaMarcador {                       // dentro de la tx, después de save(ticket) y save(op)
  marcar(ticketId: string, operacionId: string): Promise<void>;
}
export interface IPrimeraRespuestaWriteRepository {
  registrarSiFalta(ticketId: string, instante: Date): Promise<void>;
}
```

---

## Invariantes que DEBEN tener test

| Si esto falla | Defecto | Test |
|---|---|---|
| El marcador queda fuera de la tx | Transición sin pliegue y sin huérfano detectable | Integración: un rollback forzado de la tx no deja la versión incrementada |
| Pausa, reanudación y pausa con dos listeners caídos | Tramos perdidos | Unit de `RelojSla` con tres operaciones; integración: el barrido reconcilia |
| Una transición entra durante el pliegue | Se sobrescribe el reloj | Integración: CAS con versión vieja da `false` y queda pendiente |
| El cursor se ordena por tiempo y no por la secuencia estampada bajo el lock | Una transición que arrancó antes y comiteó después de un pliegue exitoso queda detrás del cursor y su tramo no se pliega nunca | Integración: transición A con `createdAt` anterior que comitea después del pliegue de B; el pliegue siguiente incluye A (`seq` de A > cursor). Unit: `t_i` recortado a monótono, sin tramos negativos. Mutación: ordenar por `created_at` pone el test en rojo |
| Las secuencias de un ticket se repiten o tienen huecos | Pliegue ambiguo | Integración: dos transiciones concurrentes sobre el mismo ticket dejan `seq` 1 y 2 y `sla_reloj_version = 2` |
| El listener de reanudación reacciona a un comentario interno | Reanudación indebida | Unit del listener y e2e: un comentario interno del solicitante deja el ticket en ESPERANDO_CLIENTE |
| Se recalcula `primeraRespuestaAt` al borrar el comentario | Se pierde la respuesta | Integración: borrar el comentario no cambia la fecha |
| El estado de espera deja de contar como abierto | Métrica de carga errónea | Integración del dashboard (WU-8): un ticket en espera cuenta en `abiertos` y en `cargaPorAgente`, y no en el cumplimiento de resolución |
| `save` con lectura vieja | Pisa `slaVenceAt`/`vencido` | Integración: cargar, consolidar, `save` → `slaVenceAt` intacto |
| Barrido sobre un pendiente | Vencido falso tras reanudar | Unit: un pendiente no se marca |
| El salto lleva a ESPERANDO_CLIENTE | Entrada sin arco | Unit del UC: ROOT recibe 422 |
| Mutación: `<=` pasa a `<` en el cumplimiento | Borde de meta | Unit: acumulado = meta cumple |

---

## Testing Strategy

| Capa | Qué | Cómo |
|---|---|---|
| Unit | `msHabilesEntre`/`sumarMsHabiles`: bordes de ventana (apertura, cierre exclusivo), feriados, fin de semana, día cerrado, `hasta <= desde`, `ms = 0`, límites; `venceAt` sin regresión; `RelojSla` (pausa con SLA vencido, reapertura, previos, `CORRIDO`, entrelazado); políticas derivadas; plantillas escapadas | Vitest, dominio puro |
| Integración | Migraciones (filas previas en NULL, defaults, CHECK, deriva Prisma/DDL), relleno (borrados, internos y del solicitante excluidos; idempotente), CAS, repos de barrido, dashboard con field references | Postgres real; `usarLockMasterTest()` en todo spec que trunca `soporte_master_test`; tenant efímero con el orden: filas, `app.close()`, `dropDatabase` |
| E2E | Transiciones (espera, salto prohibido, reanudación por comentario, mail al solicitante), primera respuesta por comentario, barrido con mail único | Guards reales, `overrideProvider(EMAIL_SENDER)` |
| Frontend | Arcos y correctivos, badge del estado, header (pausa, vencido, primera respuesta), campo de prioridad, tarjetas con "sin datos" | Testing Library + msw |

Los 5 specs que cuentan 6 estados (exploración §1.4) pasan a contar 7 en la WU-1.

---

## Threat Matrix

N/A: no hay ruteo, shell, subprocesos, VCS/PR, clasificación de ejecutables ni integración de procesos.

---

## Migration / Rollout

Cuatro migraciones tenant, cada una con `migration.sql` y `rollback.sql`, por el fan-out
`migrate:tenants` del deploy:

| # | WU | Contenido | Rollback |
|---|---|---|---|
| M1 `…_estado_esperando_cliente` | 1 | `INSERT INTO estados … ('ESPERANDO_CLIENTE','Esperando al cliente',35,…) ON CONFLICT (codigo) DO NOTHING`; el seeder suma el estado en `tenant-seeder.adapter.ts:80-87` para los tenants nuevos | Mueve los tickets en espera a EN_PROCESO y borra la fila |
| M2 `…_tickets_reloj_sla` | 3a | Columnas de `tickets`, defaults en dos pasos, CHECK e índice parcial de ADR-1; `operaciones_ticket.sla_reloj_seq` con su índice parcial | `DROP INDEX`, `DROP CONSTRAINT`, `DROP COLUMN` |
| M3 `…_prioridades_primera_respuesta` | 5 | `sla_primera_respuesta_horas integer NULL` + CHECK `> 0` | `DROP` |
| M4 `…_tickets_primera_respuesta` | 6 | 3 columnas (`primera_respuesta_vencida` con `DEFAULT false` en los dos lados), índice parcial `WHERE primera_respuesta_at IS NULL AND NOT primera_respuesta_vencida AND primera_respuesta_vence_at IS NOT NULL`, relleno SQL de la exploración §3.6 (públicos, no borrados, autor distinto del solicitante, `WHERE primera_respuesta_at IS NULL`) | `DROP` |

- **Seguridad**:
  - antes del deploy, `EXPLAIN ANALYZE` del relleno sobre una copia de un tenant de prueba;
  - conteo de `COMENTARIO` por tenant;
  - el `migrate deploy` es transaccional por tenant.
- **Ninguna migración recalcula** vencimientos ni cumplimientos (`sla-reloj-activo` R7, R8).
- **Exposición**: el deploy se hace con la cadena completa. Si M1 llega a producción sin las WU-3,
  la espera existiría sin pausa.

---

## Work Units (`auto-chain`, un PR por WU)

| WU | Alcance | Depende de | Líneas |
|---|---|---|---|
| 1 | M1, seeder, constantes (`ESTADOS_RELOJ_CORRE`, no destino correctivo), máquina, guardia del salto, 5 specs | — | ~300 |
| 2 | Motor hábil (`entre`, `sumar`, `tope`), medidores, tests de bordes | — | ~330 |
| 3a | M2 + `schema.prisma` + deriva, mapper/repo (`Omit`, rama `create`, `slaVenceAt`/`vencido` fuera del `update`), snapshot en la entidad, marcador con secuencia + `afectaRelojSla` + evento | 1 | ~390 |
| 3b | `RelojSla` (pliegue por secuencia, recorte monótono, incorporación de previos), `ConsolidarRelojSlaUseCase`, `IRelojSlaRepository` Prisma, `RelojSlaListener` | 2, 3a | ~300 |
| 3c | `AplicarSla` con meta, pliegue previo y derivado (absorbe `setSlaVenceAt`); barrido: reconciliar pendientes y marcar vencidos con `ESTADOS_RELOJ_CORRE` sin pendientes | 3b | ~250 |
| 4 | Reanudación por comentario (con el test de comentario interno), política notificable, `templateEsperandoCliente` | 3b | ~230 |
| 5 | M3, entidad, mapper, DTO y casos de uso de prioridad, formulario y lista del frontend | — | ~340 |
| 6 | M4 + relleno, `registrarSiFalta` en tx, meta en `AplicarSla` | 3c, 5 | ~380 |
| 7 | Barrido de primera respuesta, evento, plantilla, `NotificadorVencimientoSla` + listeners | 6 | ~330 |
| 8 | Dashboard backend (tres métricas, `CalendarioLaboralModule`), specs de integración, incluido el de los tickets en espera que siguen abiertos (`dashboard-metricas-sla` R5) | 3c, 6 | ~360 |
| 9a | Políticas derivadas, DTO, `ticket-header`, `types.ts` | 3c, 6 | ~300 |
| 9b | Espejo de arcos y correctivos, `status-badge`, control de transición, tarjetas del dashboard; viñeta del roadmap Cumplida o Desviación | 1, 8, 9a | ~300 |

- **Total**: ~3.820 líneas. **Supera la estimación de la propuesta (2.600-3.400)**, sobre todo por la
  secuencia del pliegue, las WU partidas y los tests de invariantes. Ninguna WU pasa de 400.
- La WU-3 va en tres partes desde el plan (3a, 3b y 3c), y la WU-9 en dos (9a y 9b), para quedar bajo
  400. Orden de la cadena: 1, 2, 3a, 3b, 3c, 4, 5, 6, 7, 8, 9a, 9b.
- Cada WU compila sola y se revierte con `git revert` en orden inverso.
- **Deuda de Ayuda**: estado nuevo, regla de pausa, campo de prioridad e indicadores. Se anota en el
  commit y en el PR de las WU 1, 5, 8 y 9b.

---

## Open Questions

Ninguna. Las dos que había quedaron cerradas en la corrida correctiva del gatekeeper:

- [x] `slaActivo` **no** apaga la meta de primera respuesta. Solo un valor vacío significa sin meta, y
  `slaActivo` sigue gobernando únicamente la resolución (ADR-6).
- [x] La meta del cumplimiento es la de la prioridad del ticket, **fijada al crear o repriorizar** en
  `sla_meta_s`. Editar las horas de una prioridad no afecta a los tickets existentes. Para un ticket
  previo, la meta es el tiempo hábil entre su creación y su vencimiento (ADR-4). La redacción de
  `sla-reloj-activo` R3 la ajusta el orquestador.
