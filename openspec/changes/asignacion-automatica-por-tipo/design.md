# Design: asignación automática por tipo

## Technical Approach

Decisión de producto: `docs/roadmap-comercial.md`, "Decisiones de producto de la segunda etapa",
viñeta "Segunda etapa, punto 9 — asignación automática por tipo", incluidas las "Precisiones del
2026-10-09, al explorar". Propuesta: `proposal.md` (D1-D8, P1-P4). Evidencia: `exploration.md`
(las afirmaciones que sostienen este diseño se re-verificaron contra el código el 2026-10-09).

Enfoque 1 de la exploración, con cuatro piezas:

1. **Tabla tenant `reglas_asignacion`**, una fila por tipo con regla. Sin fila = sin regla.
2. **`ResolverAsignacionAutomatica`**, servicio de aplicación que corre en la fase de solo lectura,
   **antes** de la transacción, de los tres casos de uso de alta (`CrearTicketUseCase`,
   `CrearTicketSoporteUseCase`, `CrearTicketEdilicioUseCase`). Por esos tres pasan los cinco
   canales: el formulario público entra por Soporte y el preventivo por `CrearTicketUseCase`.
   Nunca hace fallar un alta por un problema de configuración.
3. **`TicketAsignadoEvent`** (`ticket.asignado`), publicado post-commit con `alCommitear` desde el
   alta con regla y desde las dos asignaciones manuales. Lo consume un listener nuevo de
   `notificaciones`.
4. **Módulo `reglas-asignacion`** (API de configuración) y pantalla `/admin/reglas-asignacion`.

Se reutilizan cuatro moldes sin cambiarles la forma: el servicio plano exportado por
`TicketsModule` (`ResolverCicloActivoParaCreacion`, `tickets.module.ts:173-178`), el autor centinela
(`AUTOR_FORMULARIO_PUBLICO`, `formulario-publico.constants.ts:10`), el listener de mail a un usuario
(`PreventivoGeneradoNotificacionListener`) y la ruta de configuración del tenant (`JwtAuthGuard,
TenantGuard` por clase y `AdminClienteGuard` por método, `politica-tfa.controller.ts:29-43`).

---

## Capa donde cae cada pieza (`rules.design`)

| Pieza | Capa | Por qué |
|---|---|---|
| `ReglaAsignacion` (tipo de lectura), `IReglaAsignacionRepository` + token | domain (`tickets/domain/ports/`) | Contrato sin Prisma. Vive en `tickets` porque lo consumen las altas, no solo la pantalla |
| `AUTOR_SISTEMA`, `DESCRIPCION_ASIGNACION_POR_REGLA`, `ORIGEN_ASIGNACION` | domain (`tickets/domain/constants/`) | Constantes de dominio, mismo lugar que `AUTOR_FORMULARIO_PUBLICO` |
| `TicketAsignadoEvent` | domain (`tickets/domain/events/`) | Junto a `TicketCreadoEvent` |
| `TicketCerradoNoReasignableError` | domain (`tickets/domain/errors/tickets.errors.ts`) | Error esperado, `Result.fail` |
| `evaluarResponsableRegla`, `esResponsableElegible` | application (`tickets/application/services/elegibilidad-responsable-regla.ts`) | Orquesta un puerto (checker); fuente única de "responsable válido" (ADR-5) |
| `ResolverAsignacionAutomatica`, `operacionesDeApertura` | application (`tickets/application/services/`) | Compartidos por tres casos de uso de dos módulos |
| `ListarReglasAsignacionUseCase`, `ConfigurarReglaAsignacionUseCase` | application (`reglas-asignacion/application/use-cases/`) | Un caso por acción |
| `PrismaReglaAsignacionRepository` | infrastructure (`tickets/infrastructure/persistence/prisma/`) | Único lugar con `@prisma/client` |
| `TicketAsignadoNotificacionListener` | infrastructure (`notificaciones/infrastructure/listeners/`) | Adaptador `@OnEvent`, como los otros listeners |
| `templateTicketAsignado` | domain (`notificaciones/domain/templates/email-templates.ts`) | Función pura, convención existente del repo |
| `ReglasAsignacionController`, DTOs `class-validator` | interface (`reglas-asignacion/interface/`) | Traducen, sin lógica |

**Fuente única** (`rules.specs`):

- **Universo de responsables válidos**: `IUsuarioMasterChecker.listarTecnicosAsignables(clienteId, modulo)`
  (`usuario-master.checker.ts:153-189`): usuario activo y no borrado, membresía activa con rol
  TECNICO o COLABORADOR en el cliente, al menos una acción en el módulo del tipo. Es el mismo
  universo que ofrece hoy el combo de asignación manual (P1). Lo usan el alta, la lectura de la
  pantalla y la escritura.
- **Estados de una regla**: `ESTADOS_REGLA_ASIGNACION = ['SIN_REGLA', 'VALIDA', 'ROTA'] as const` en
  `reglas-asignacion/domain/estado-regla-asignacion.ts`. El Zod del frontend
  (`features/reglas-asignacion/schemas.ts`) lo espeja.
- **Estados que bloquean la reasignación**: `ESTADOS_TERMINALES` (`CERRADO`, `CANCELADO`,
  `tickets/domain/state-machine/estados.constants.ts:25`). El frontend
  (`features/tickets/lib/estado-transitions.ts`) lo espeja.

### Autorización: los dos lugares donde vive

| Ruta | Borde | Inline |
|---|---|---|
| `GET /reglas-asignacion`, `PUT /reglas-asignacion/:tipoId` | `JwtAuthGuard, TenantGuard` por clase; `AdminClienteGuard` por método (ADMINISTRADOR o ROOT, D8). `ParseUUIDPipe` en `:tipoId` | `clienteId = actor.cliente_id`, nunca del body. El tipo se busca en el tenant del contexto (404 si no existe o está dado de baja). El `PUT` vuelve a evaluar al responsable en el servidor (422 si no es válido, D5) |
| `PATCH /tickets/:id/asignar` | Sin cambios: `RequiereAcciones('TICKETS:ASIGNAR')` | Nuevo: estado terminal → 422 (D6, P2). Se mantienen `estaActivoEnTenant` y `esAsignadoElegiblePorModulo`. El paso `NUEVO → ASIGNADO` (P4) **no** exige `TICKETS:TRANSICIONAR`: es consecuencia de la asignación, igual que en el alta con regla |
| `PATCH /tickets/:id/asignar-en-proceso` | Sin cambios (`TICKETS:ASIGNAR` + `TICKETS:TRANSICIONAR`) | Hoy rechaza `RESUELTO`, `CERRADO` y `CANCELADO` con `TransicionInvalidaError` (`:214-220`). M1 pide `TicketCerradoNoReasignableError` para los terminales: se agrega, antes de `resolverPasosHastaEnProceso`, la guarda `ESTADOS_TERMINALES.has(estadoActual.codigo)` con ese error. `RESUELTO` conserva `TransicionInvalidaError` (ambos 422) |
| Alta (5 canales) | Sin cambios | La regla no es una entrada del caller: la resuelve el servidor por el tipo del ticket |

---

## Architecture Decisions

### ADR-1: tabla propia `reglas_asignacion` (migración tenant única M1)

| Opción | Tradeoff | Decisión |
|---|---|---|
| Columna `responsable_asignacion_id` en `tipos_ticket` | Un `ALTER`, pero toca `TipoTicketEntity`, mapper, DTOs, `EditarTipoTicketUseCase`, el CRUD de Catálogos y su frontend. Un `save()` del tipo con lectura vieja pisaría la regla | Rechazada |
| **Tabla `reglas_asignacion` con PK = `tipo_id`** | Una tabla, un repo y una migración más; la regla queda aislada del catálogo | **Elegida** |

| Columna | Tipo | Restricción |
|---|---|---|
| `tipo_id` | `UUID NOT NULL` | PK; FK → `tipos_ticket(id) ON DELETE CASCADE ON UPDATE CASCADE`. La PK garantiza una regla por tipo (D2) |
| `responsable_id` | `UUID NOT NULL` | Soft ref a `master.usuarios`, sin FK (cross-DB, igual que `tickets.asignado_id`). NOT NULL porque "sin regla" = sin fila (D8) |
| `actualizado_por` | `UUID NOT NULL` | Soft ref al actor del último `PUT`. Rastro mínimo de quién la configuró |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP` | |
| `updated_at` | `TIMESTAMPTZ NOT NULL` | `@updatedAt` de Prisma |

- Carpeta: `backend/prisma_tenant/migrations/20261009120000_reglas_asignacion/` con `migration.sql`
  y `rollback.sql` (`DROP TABLE IF EXISTS "reglas_asignacion";`, destructivo: borra las reglas, ningún
  ticket las referencia). Formato de cabecera y nombres de constraints como
  `20261006120000_respuestas_predefinidas`.
- Prisma: `model ReglaAsignacion { … @@map("reglas_asignacion") }` y la back-relation opcional
  `reglaAsignacion ReglaAsignacion?` en `TipoTicket`. Es solo de esquema: ni `TipoTicketEntity` ni su
  mapper cambian.
- Sin seed: la tabla nace vacía, así que todos los tipos arrancan sin regla y el alta se comporta
  como hoy.
- **Tipo dado de baja**: en este repo "baja" es `deleted_at` y `activo = false` a la vez
  (`tipo-ticket.entity.ts:98-105`), así que no existe un tipo "inactivo pero no borrado". La
  pantalla no lo lista (R4, R6: una fila por tipo **activo**) y el resolver ignora su regla. Así lo
  que se ve en la pantalla es exactamente lo que aplica. La fila de la regla queda en la tabla y se
  reactiva con el tipo.

### ADR-2: el resolver corre antes de la transacción y nunca rompe el alta por configuración

| Opción | Tradeoff | Decisión |
|---|---|---|
| Listener post-commit de `ticket.creado` | No es atómico: si falla, el ticket queda en Nuevo sin reintento y compite con el listener de SLA. Contradice "nace en Asignado" (D4) | Rechazada |
| Hook en `PrismaTicketRepository.save` | Una decisión de negocio escondida en infraestructura | Rechazada |
| **Servicio de aplicación en la fase de lectura de los 3 casos de uso + escritura en la misma transacción del alta** | Agrega una dependencia a 3 constructores y sus specs | **Elegida** |

Contrato (`resolver(tipo, clienteId): Promise<AsignacionAutomatica | null>`):

| Paso | Consulta | Si falla o no cumple |
|---|---|---|
| 1. `tipo.isDeleted() \|\| !tipo.activo` | — | `null` |
| 2. `reglaRepo.findByTipoId(tipo.id)` | tenant, por PK | Sin fila → `null` sin tocar master. **Excepción → se propaga** |
| 3. `evaluarResponsableRegla(responsableId, clienteId, tipo.modulo)` | master (`listarTecnicosAsignables`) | `false` → log `ASIGNACION_AUTOMATICA_REGLA_ROTA \| tipoId=… \| responsableId=…` y `null` (D5). **Excepción → se captura**, log `ASIGNACION_AUTOMATICA_DEGRADADA \| tipoId=… \| error=<nombre de la clase del error>` y `null` |
| 4. `estadoRepo.findIdByCodigo('ASIGNADO')`, `tipoOperacionRepo.findIdByCodigo('ASIGNACION')` | tenant | Ausente → `throw` defensivo (catálogo fijo del seed; mismo patrón que `crear-ticket.use-case.ts:130-143`) |

**Por qué se degrada solo lo de master.** Las consultas de master van por
`PrismaService.getMasterClient()`, una conexión distinta de la transacción del tenant. Un fallo ahí
no contamina nada y degradar a Nuevo cumple "un problema de configuración nunca impide pedir ayuda".
Una consulta **tenant** que falla dentro de la transacción del preventivo (la fase de lectura de
`CrearTicketUseCase` ya corre adentro de la transacción por plan, por el runner re-entrante,
`tenant-transaction-runner.ts:92-94`) deja la transacción de Postgres abortada: tragarla haría fallar
la sentencia siguiente con "current transaction is aborted" y escondería la causa real. Se propaga,
igual que hoy se propaga un fallo de `tipoTicketRepo.findById`. En el preventivo eso termina en el
`throw` por plan y en un ROLLBACK total que el tick siguiente reintenta (`generar-preventivos.use-case.ts:212-220`),
que es el comportamiento vigente ante una base caída.

- **El resolver nunca devuelve `Result.fail`**: su salida es "asignación o nada". Una regla rota
  nunca llega al `throw` del preventivo por responsable inválido, porque nunca es un fallo.
- **Costo**: sin regla, 1 consulta tenant por PK. Con regla, más 2 de master y 2 de catálogo. Todo
  fuera del advisory lock de numeración.
- **Carrera**: un usuario dado de baja entre la evaluación y el commit queda asignado. Es la misma
  ventana que hoy tiene la asignación manual; se acepta.
- **Firma del tipo**: recibe la entidad que el alta ya cargó (`findById` en `CrearTicketUseCase`,
  `findByCodigo` en Soporte y Edilicia), así que no vuelve a buscarla.

### ADR-3: qué escribe el alta cuando la regla asigna

| Opción | Tradeoff | Decisión |
|---|---|---|
| Apertura `null → NUEVO` + `CAMBIO_ESTADO NUEVO → ASIGNADO` + `ASIGNACION` | La historia siempre arranca en Nuevo, pero son tres filas, y el `CAMBIO_ESTADO` del sistema sale como "Usuario" en el PDF | Rechazada |
| **Apertura `null → ASIGNADO` + `ASIGNACION` del sistema** | Dos filas; el PDF ya rinde `null` como "Nuevo" (`generar-pdf-ticket.use-case.ts:170`), así que muestra "Nuevo -> Asignado" | **Elegida** |

En la misma transacción, en este orden:

1. `TicketEntity.create({ …, estadoId: estadoInicialId })` y, si hay asignación,
   `ticket.assignTo(asignadoId)` antes del primer `save()` (`ticket.entity.ts:329`).
   `estadoInicialId = asignacion?.estadoAsignadoId ?? estadoNuevoId`.
2. Apertura `CAMBIO_ESTADO`: `estadoAnteriorId = null`, `estadoNuevoId = estadoInicialId`, autor
   **sin cambios** (el actor, o `AUTOR_FORMULARIO_PUBLICO` en el formulario público, o
   `plan.responsableId` en el preventivo). Registra quién creó el ticket.
3. Solo con asignación, `ASIGNACION`: `autorId = AUTOR_SISTEMA`, `esInterno = false`,
   `descripcion = DESCRIPCION_ASIGNACION_POR_REGLA` = `"Asignado automáticamente por la regla de
   asignación del tipo de ticket."`, `metadata = { origen: 'REGLA_TIPO', tipoId, asignadoId }`. La
   descripción es lo que lee la persona: el timeline solo muestra etiqueta, fecha y descripción
   (`ticket-timeline.tsx:44-53`). La metadata es para máquinas.
4. Los `save` de siempre (ticket, operaciones, satélite).

`operacionesDeApertura({ ticketId, estadoInicialId, tipoOperacionAperturaId, autorId, asignacion })`
devuelve `[apertura]` o `[apertura, asignacion]`. Los tres casos de uso lo usan en lugar de
construir la apertura a mano, para no triplicar el armado.

- **Por qué se ve igual el reloj de SLA**: `NUEVO` y `ASIGNADO` corren el reloj
  (`estados.constants.ts:33-37`); la primera respuesta solo la marca un comentario público
  (`crear-comentario.use-case.ts:125-129`). La regla no toca ninguno de los dos.
- **Por qué se ve igual el preventivo**: el ticket abierto del plan se mide con
  `ESTADOS_TICKET_ATENDIDO` (`RESUELTO/CERRADO/CANCELADO`); `ASIGNADO` sigue contando como pendiente.

### ADR-4: `AUTOR_SISTEMA`, un segundo UUID reservado

| Opción | Tradeoff | Decisión |
|---|---|---|
| Reusar el UUID nulo | Mezcla "solicitante externo" con "sistema"; solo la metadata los distinguiría | Rechazada |
| Usar al actor humano como autor | Afirma que una persona asignó el ticket: falso (D4) | Rechazada |
| **`AUTOR_SISTEMA = '00000000-0000-0000-0000-000000000001'`** | Una constante. El nibble de versión es 0, así que `gen_random_uuid()` (v4) nunca lo genera | **Elegida** |

- Archivo: `tickets/domain/constants/autor-sistema.constants.ts`, con la misma justificación en el
  JSDoc que `formulario-publico.constants.ts`.
- **PDF**: sin cambios. La ficha solo incluye `COMENTARIO` y `CAMBIO_ESTADO`
  (`generar-pdf-ticket.use-case.ts:130-133`), y la apertura conserva al autor humano, así que
  `AUTOR_SISTEMA` nunca aparece ahí. Mapear el centinela a "Sistema" sería código sin caso.
- **Timeline web**: sin cambios. No muestra autores; la `descripcion` lleva el mensaje.

### ADR-5: elegibilidad del responsable = universo de `listarTecnicosAsignables`

| Opción | Tradeoff | Decisión |
|---|---|---|
| `estaActivoEnTenant` + `esAsignadoElegiblePorModulo` | Acepta ADMINISTRADOR y ROOT (`esAdminTotal`), contra P1. Además `getAutorizacionModulos` cuenta cualquier acción en el módulo, así que un rol sin función técnica con permiso de lectura pasaría | Rechazada |
| Método nuevo `esTecnicoAsignable(usuarioId, clienteId, modulo)` en el checker | Una consulta puntual, pero es una segunda definición del universo que puede divergir de la del combo | Rechazada |
| **`listarTecnicosAsignables(clienteId, modulo).some(c => c.id === responsableId)`** | 2 consultas de master por evaluación. Coincide por construcción con lo que ofrece el selector (P1, D5) | **Elegida** |

- `esResponsableElegible(responsableId, candidatos)`: función pura. `evaluarResponsableRegla(responsableId, clienteId, modulo, checker)`:
  pide la lista y aplica la función pura.
- **Lectura de la pantalla**: una llamada a `listarTecnicosAsignables` por **módulo distinto** (no
  por fila). La misma lista sirve para los candidatos del selector y para calcular `VALIDA`/`ROTA`.
- **Qué cubre "rota"**: usuario dado de baja o borrado, membresía inactiva o borrada, rol cambiado a
  ADMINISTRADOR o a uno no técnico, módulo quitado, y el `modulo` del tipo editado después (la
  evaluación lee `tipos_ticket.modulo` actual). El checker devuelve booleanos, así que la v1 muestra un
  motivo genérico.
- **La asignación manual no cambia**: sigue aceptando ADMINISTRADOR y ROOT
  (`elegibilidad-asignado.ts:34-37`). P1 restringe solo al responsable de una regla.

### ADR-6: asignación manual (D6, P2, P4)

`AsignarTicketUseCase` (constructor + `estadoRepo: Pick<IEstadoRepository, 'findById' | 'findIdByCodigo'>`
y `eventPublisher: IDomainEventPublisher`):

1. Ticket inexistente o borrado → `TicketNoEncontradoError` (404), sin cambios.
2. **Nuevo**: `estadoActual = estadoRepo.findById(ticket.estadoId)` (ausente → `throw` defensivo). Si
   `ESTADOS_TERMINALES.has(estadoActual.codigo)` → `TicketCerradoNoReasignableError(ticketId, codigo)`,
   422, mapeado de forma explícita en `toHttpException` (`tickets.controller.ts:139-160`). Va antes de
   las validaciones del asignado: es determinista y no consulta master.
3. `estaActivoEnTenant` + `esAsignadoElegiblePorModulo`, sin cambios.
4. Ids de `ASIGNACION` y, **solo si el estado es `NUEVO`**, de `ASIGNADO` y `CAMBIO_ESTADO`.
5. Transacción: `assignTo`; operación `ASIGNACION` (autor = actor, `descripcion` y `metadata` en
   `null`, como hoy); si era `NUEVO`: `updateEstado(ASIGNADO)` y operación `CAMBIO_ESTADO NUEVO →
   ASIGNADO` del actor; `save` del ticket. Mismo orden que `AsignarYPonerEnProcesoUseCase`
   (`:162-196`).
6. `alCommitear(() => publish(new TicketAsignadoEvent({ ticketId, asignadoId, origen: 'MANUAL', autorId: actorId })))`.

- `RESUELTO` sigue siendo reasignable (P2) y no cambia de estado. `ASIGNADO`, `EN_PROCESO` y
  `ESPERANDO_CLIENTE` tampoco cambian de estado.
- **Sin `ticket.estado_cambiado`** en el paso implícito `NUEVO → ASIGNADO`, igual que
  `AsignarYPonerEnProcesoUseCase` hoy: no se avisa al solicitante de un paso que no afecta el reloj y
  que el alta con regla tampoco avisa.
- Reasignar a la misma persona mantiene la conducta vigente: escribe la operación y ahora también
  manda el mail. No se agrega una regla nueva para ese caso.
- `AsignarYPonerEnProcesoUseCase`: + `eventPublisher`; guarda de estados terminales con
  `TicketCerradoNoReasignableError` (M1) antes de resolver los pasos; después del `run`, el mismo `alCommitear` con
  `origen: 'MANUAL'` y `autorId` del actor. Sin otros cambios.
- Comentarios que pasan a ser falsos y se reescriben: `tickets.controller.ts:567` ("el sistema nunca
  auto-asigna"), `asignar-ticket.use-case.ts:24-26` (auto-asignación prohibida) y `:68-73`
  ("DELIBERADAMENTE NO transiciona"). El JSDoc de `listarTecnicosAsignables` suma que también define
  el universo de responsables de regla.

### ADR-7: evento `ticket.asignado` y mail (D7, P3)

```ts
export type OrigenAsignacion = 'REGLA_TIPO' | 'MANUAL';
export class TicketAsignadoEvent implements DomainEvent {
  readonly name = 'ticket.asignado';
  readonly occurredAt: Date;
  readonly ticketId: string;
  readonly asignadoId: string;
  readonly origen: OrigenAsignacion;
  /** Quien asigna a mano; `null` cuando asigna la regla (REGLA_TIPO). */
  readonly autorId: string | null;
  constructor(props: { ticketId: string; asignadoId: string; origen: OrigenAsignacion; autorId: string | null; occurredAt?: Date });
}
```

Solo ids y el origen (`autorId` es un UUID, no un dato personal; `null` en `REGLA_TIPO`), sin PII, igual que `TicketCreadoEvent`. Se publica desde 5 lugares, siempre
con `alCommitear`: las 3 altas (solo si el resolver asignó, después de `TicketCreadoEvent`) y las 2
asignaciones manuales. `alCommitear` encola en la transacción más externa
(`tenant-transaction-runner.ts:159-188`): en el preventivo el mail sale recién al commit del plan, y
un ROLLBACK no deja ningún mail de un ticket inexistente.

`TicketAsignadoNotificacionListener` (molde `PreventivoGeneradoNotificacionListener`):
`@OnEvent('ticket.asignado')` → `ticketRepo.findById` (si no existe, log `TICKET_ASIGNADO_SIN_TICKET | ticketId=…` y termina) →
`tipoTicketRepo.findById` y `prioridadRepo.findById` (solo para el `nombre`; un faltante omite esa línea
del mail, no lo cancela) → `contactoResolver.resolverContacto(event.asignadoId)` (si no hay contacto, log
`TICKET_ASIGNADO_SIN_CONTACTO | ticketId=…` sin dirección ni nombre y termina, N5) →
`templateTicketAsignado({ numero, titulo, tipoNombre, prioridadNombre, ticketId, appBaseUrl, origen })` →
`emailSender.send`. Todo envuelto en log-and-swallow con el `ticketId`, nunca el error crudo con datos
del destinatario (N5).

- **Sin correo configurado** (D7, N4): `TenantAwareEmailSender` ya registra `EMAIL_CLIENTE_SIN_CONFIG`
  (el motivo, sin direcciones ni nombres) y vuelve sin lanzar (`tenant-aware-email-sender.ts:99-128`). La asignación ya comiteó. No hace
  falta lógica nueva.
- **Autoasignación** (P3): se manda igual. El evento lleva `autorId` (N1) pero el listener no lo
  compara con `asignadoId`: no hay rama de omisión (N3).
- **Preventivo con regla**: puede salir un mail de `preventivo.generado` (responsable del plan y
  administradores) y otro de `ticket.asignado` (responsable de la regla) a la misma persona. Son
  avisos distintos; no se deduplican.
- **Plantilla**: asunto `Ticket {numero} asignado a usted`. El cuerpo lista número, título, tipo y
  prioridad (N2) y dice "por la regla de
  asignación de su tipo" o "por una asignación manual" según `origen`, con escape HTML y el link
  `/tickets/:id`. El destinatario siempre es un usuario con cuenta, así que el link va siempre.
- **TenantContext**: el `emit` es síncrono dentro del scope ALS del emisor (HTTP, formulario
  público, barrido de preventivos). Es el mismo mecanismo del que depende el listener del
  preventivo.

### ADR-8: módulo `reglas-asignacion` y cableado sin ciclos

| Opción | Tradeoff | Decisión |
|---|---|---|
| Todo dentro de `TicketsModule` | Lo engorda con una pantalla de administración | Rechazada |
| **Puerto, repo, evaluador y resolver en `tickets`; casos de uso y controller de la pantalla en `reglas-asignacion`** | El alta depende del resolver y la pantalla depende de `tickets`, nunca al revés | **Elegida** |

- `TicketsModule`: registra `REGLA_ASIGNACION_REPOSITORY → PrismaReglaAsignacionRepository` y
  `ResolverAsignacionAutomatica` (`useFactory` con `REGLA_ASIGNACION_REPOSITORY`,
  `USUARIO_MASTER_CHECKER`, `ESTADO_REPOSITORY`, `TIPO_OPERACION_REPOSITORY`, `LOGGER`). Lo inyecta
  en `CrearTicketUseCase` y suma `ESTADO_REPOSITORY`/`DOMAIN_EVENT_PUBLISHER` a los factories de las
  dos asignaciones. **Exporta** `REGLA_ASIGNACION_REPOSITORY` y `ResolverAsignacionAutomatica`.
- `EquiposModule` y `ReparacionesModule` ya importan `TicketsModule`: suman
  `ResolverAsignacionAutomatica` al `inject` de sus factories de alta. No lo reconstruyen, a
  diferencia de `NumeradorTicket`, para que el resolver tenga una sola construcción.
- `PreventivoModule` y `FormularioPublicoModule`: sin cambios (reusan las altas exportadas).
- `ReglasAsignacionModule`: `imports: [AuthModule, TicketsModule]`, se registra en `app.module.ts`.
  `TicketsModule` no lo importa, así que no hay ciclo.
- `NotificacionesModule`: suma el listener (`TICKET_REPOSITORY`, `TIPO_TICKET_REPOSITORY`,
  `PRIORIDAD_REPOSITORY`, `USUARIO_CONTACTO_RESOLVER`, `EMAIL_SENDER`, `LOGGER`). Si el módulo no tiene
  hoy esos dos tokens, los toma de `TicketsModule`, que ya los exporta o los debe exportar.

### ADR-9: API de configuración

| Endpoint | Body | Respuesta |
|---|---|---|
| `GET /reglas-asignacion` | — | `{ reglas: ReglaAsignacionFilaDto[], candidatosPorModulo: Record<modulo, CandidatoDto[]> }` · 403 |
| `PUT /reglas-asignacion/:tipoId` | `{ responsableId: string \| null }` | `ReglaAsignacionFilaDto` · 403 · 404 (tipo inexistente o borrado) · 422 (`ResponsableReglaNoElegibleError`) |

```ts
interface ReglaAsignacionFilaDto {
  tipoId: string; codigo: string; nombre: string; modulo: string;
  responsableId: string | null; responsableNombre: string | null;
  estado: 'SIN_REGLA' | 'VALIDA' | 'ROTA';
}
interface CandidatoDto { id: string; nombre: string; apellido: string }
```

- **Listar**: `tipoTicketRepo.findAllActive()` (solo tipos activos: filtra `deleted_at`, y baja = `activo=false`) + `reglaRepo.listar()` +
  `listarTecnicosAsignables` por módulo distinto. `VALIDA` toma el nombre del candidato. `ROTA` toma el
  nombre de `resolverNombres` en lote; si el usuario fue borrado, `null` y la UI muestra "Usuario no
  disponible".
- **Configurar**: `responsableId = null` → `quitar(tipoId)`, idempotente. Si viene un UUID, se llama
  a `evaluarResponsableRegla` sin capturar (un fallo de master en una escritura de configuración es un
  500 honesto, no una degradación) y después a `fijar(tipoId, responsableId, actor.sub)`, que es un
  upsert por PK.
- DTO: `@IsDefined()`, `@ValidateIf(o => o.responsableId !== null) @IsUUID()`.
- Errores propios en `reglas-asignacion/domain/errors.ts`: `TipoTicketNoConfigurableError` (404, tipo inexistente o dado de baja) y
  `ResponsableReglaNoElegibleError` (422). Los mapea el controller.

### ADR-10: frontend

- **Pantalla**: `app/(dashboard)/admin/reglas-asignacion/page.tsx`, server component fino (molde
  `admin/modelos-equipo/page.tsx`). Vista `features/reglas-asignacion/components/reglas-asignacion-admin-view.tsx`
  dentro de `<SoloAdminCliente>` + `<AdminNav />`. Una fila por tipo activo con nombre, código y módulo. El responsable se elige con el `Select` nativo de
  `@/components/ui/select`: la opción vacía es "Sin regla" y el resto son los candidatos del
  módulo. Se suma un badge de estado ("Sin regla", "Activa", "Rota"); el de "Rota" lleva el texto
  "Ya no es válido: dado de baja, sin acceso al cliente o sin el módulo del tipo". Si la regla está
  rota, el responsable actual aparece como opción deshabilitada para que el selector no mienta. Cada
  cambio dispara su `PUT`, con la fila deshabilitada mientras corre. El `Select` es controlado por el
  valor del servidor: si el `PUT` responde 422 (u otro error) se muestra el toast y el selector vuelve
  a la regla anterior, que no se perdió (R6, "Cambio rechazado").
- **Hooks**: `useReglasAsignacion()` (`queryKey: ["reglas-asignacion"]`) y
  `useConfigurarReglaAsignacion()` (invalida esa key; toast con `notifySuccess`/`notifyError`),
  sobre `apiFetch`, como `use-modelos-equipo.ts`. Los schemas Zod (`schemas.ts`) espejan los DTOs.
- **Navegación**: `{ href: "/admin/reglas-asignacion", label: "Asignación automática" }` en
  `ADMIN_NAV_ITEMS` (`admin-nav.tsx:38`), con el mismo gate `esAdminCliente`.
- **Reasignar**: `TicketReasignarControl` (presentacional, con gate `TICKETS:ASIGNAR`) usa el
  `useAsignarTicket` que ya existe (`use-ticket-mutations.ts:69`, sin consumidores hoy) y los
  candidatos de `useTecnicosAsignables`, que la vista ya carga. Se monta cuando
  `puedeReasignar(estadoCodigo)`, es decir en `NUEVO`, `ASIGNADO`, `EN_PROCESO`, `ESPERANDO_CLIENTE`
  y `RESUELTO` (decisión del dueño, coherente con D6 "reasignar en cualquier momento hasta que se
  cierra"; amplía M4 de la spec, ver nota de reconciliación). En `NUEVO` y `ASIGNADO` conviven los
  dos controles: el unificado "Asignar y poner en proceso" y la reasignación simple, que asigna sin
  forzar un cambio de estado (en `NUEVO` el backend lo pasa a `ASIGNADO`, P4). En `CERRADO` y
  `CANCELADO` no se muestra nada. `puedeReasignar` es el complemento de `ESTADOS_TERMINALES`.

---

## Data Flow

```
Alta (POST /tickets | Soporte | formulario público→Soporte | Edilicia | barrido→CrearTicket)
  validaciones de solo lectura (solicitante, ciclo, tipo, prioridad, catálogos)
  ResolverAsignacionAutomatica(tipo, clienteId)
    ├ tipo borrado / sin fila ───────────────────────────────────────→ null
    ├ reglaRepo (tenant) lanza ──────────────────────────────────────→ PROPAGA
    ├ listarTecnicosAsignables (master) lanza ──→ log DEGRADADA ─────→ null
    ├ responsable fuera del universo ───────────→ log REGLA_ROTA ────→ null
    └ válido ─→ {asignadoId, estadoAsignadoId, tipoOperacionAsignacionId}
  txRunner.run: numerar → Ticket(estado inicial, asignado) → apertura null→inicial
                → [ASIGNACION por AUTOR_SISTEMA] → satélite
  alCommitear: ticket.creado → [ticket.asignado REGLA_TIPO]
                                     │
PATCH /asignar ─ terminal? 422 ─ elegible ─ tx(ASIGNACION [+ NUEVO→ASIGNADO]) ─ alCommitear ticket.asignado MANUAL
PATCH /asignar-en-proceso ─ (sin cambios) ─ alCommitear ticket.asignado MANUAL
                                     ▼
TicketAsignadoNotificacionListener → contacto del asignado → templateTicketAsignado → EMAIL_SENDER
                                                                 (sin config SMTP: log, no envía)
```

---

## File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `backend/prisma_tenant/migrations/20261009120000_reglas_asignacion/{migration,rollback}.sql` | Create | ADR-1 |
| `backend/prisma_tenant/schema.prisma` | Modify | `ReglaAsignacion` + back-relation en `TipoTicket` |
| `backend/src/tickets/domain/ports/i-regla-asignacion.repository.ts` | Create | Puerto + token |
| `backend/src/tickets/infrastructure/persistence/prisma/prisma-regla-asignacion.repository.ts` | Create | `findByTipoId`, `listar`, `fijar` (upsert), `quitar` (`deleteMany`) |
| `backend/src/tickets/domain/constants/autor-sistema.constants.ts` | Create | `AUTOR_SISTEMA`, `DESCRIPCION_ASIGNACION_POR_REGLA` |
| `backend/src/tickets/domain/events/ticket-asignado.event.ts` | Create | ADR-7 |
| `backend/src/tickets/domain/errors/tickets.errors.ts` | Modify | `TicketCerradoNoReasignableError` |
| `backend/src/tickets/application/services/elegibilidad-responsable-regla.ts` | Create | ADR-5 |
| `backend/src/tickets/application/services/resolver-asignacion-automatica.service.ts` | Create | ADR-2 |
| `backend/src/tickets/application/services/operaciones-apertura.ts` | Create | ADR-3 |
| `backend/src/tickets/application/use-cases/crear-ticket.use-case.ts` | Modify | Resolver, estado inicial, operaciones, evento |
| `backend/src/equipos/application/use-cases/crear-ticket-soporte.use-case.ts` | Modify | Ídem |
| `backend/src/reparaciones/application/use-cases/crear-ticket-edilicio.use-case.ts` | Modify | Ídem |
| `backend/src/tickets/application/use-cases/asignar-ticket.use-case.ts` | Modify | ADR-6 |
| `backend/src/tickets/application/use-cases/asignar-y-poner-en-proceso.use-case.ts` | Modify | Guarda terminal M1 + evento |
| `backend/src/tickets/interface/controllers/tickets.controller.ts` | Modify | Mapeo 422, JSDoc |
| `backend/src/tickets/domain/ports/i-usuario-master.checker.ts` | Modify | JSDoc de `listarTecnicosAsignables` |
| `backend/src/tickets/tickets.module.ts`, `equipos/equipos.module.ts`, `reparaciones/reparaciones.module.ts` | Modify | ADR-8 |
| `backend/src/reglas-asignacion/**` (módulo, 2 casos de uso, controller, DTOs, errores, estados) | Create | ADR-9 |
| `backend/src/app.module.ts` | Modify | Registra `ReglasAsignacionModule` |
| `backend/src/notificaciones/domain/templates/email-templates.ts` | Modify | `templateTicketAsignado` |
| `backend/src/notificaciones/infrastructure/listeners/ticket-asignado-notificacion.listener.ts` | Create | ADR-7 |
| `backend/src/notificaciones/notificaciones.module.ts` | Modify | Listener |
| `frontend/src/app/(dashboard)/admin/reglas-asignacion/page.tsx` | Create | Página |
| `frontend/src/features/reglas-asignacion/{types,schemas}.ts`, `hooks/*`, `components/*` | Create | ADR-10 |
| `frontend/src/components/shell/admin-nav.tsx` | Modify | Ítem nuevo |
| `frontend/src/features/tickets/components/ticket-reasignar-control.tsx` | Create | Control de reasignación |
| `frontend/src/features/tickets/lib/estado-transitions.ts`, `components/ticket-detail-view.tsx` | Modify | `puedeReasignar`, montaje |
| `docs/roadmap-comercial.md` | Modify | Al cierre: viñeta del punto 9 "Cumplida" o "Desviación" |

---

## Invariantes que DEBEN tener test

| Si esto falla | Defecto | Test |
|---|---|---|
| El resolver deja escapar un fallo de master | Un alta (o un plan preventivo entero) falla por una consulta de configuración | Unit: `listarTecnicosAsignables` rechaza → `null` y log. Mutación: quitar el `try/catch` pone el test en rojo |
| El resolver traga un fallo tenant | Transacción del preventivo abortada con la causa escondida | Unit: `findByTipoId` rechaza → el resolver rechaza |
| Un ADMINISTRADOR pasa como responsable | P1 | Unit de `evaluarResponsableRegla` (la lista del checker no lo incluye → `false`); e2e `PUT` con ADMIN → 422 |
| La regla rota hace fallar el alta | D5 | Unit de los 3 casos de uso + e2e `POST /tickets` con membresía desactivada → 201, Nuevo, sin asignado |
| Ticket con regla sin las dos operaciones, o fuera de la misma transacción | D4 | Integración: nace `ASIGNADO`, `asignado_id`, apertura `null→ASIGNADO` y `ASIGNACION` de `AUTOR_SISTEMA` con `metadata.origen`; con el `save` del satélite forzado a fallar → ni ticket ni operaciones |
| `ticket.asignado` sale antes del commit | Mail de un ticket que hizo ROLLBACK | Unit con runner falso: `publish` no se llama hasta correr la cola de `alCommitear`; integración del preventivo con fallo forzado → sin evento |
| Se reasigna un `CERRADO`/`CANCELADO`, o se bloquea un `RESUELTO` | D6, P2 | Unit + e2e: 422 con `TicketCerradoNoReasignableError` en los terminales, en `/asignar` y en `/asignar-en-proceso`; `RESUELTO` → 200 sin cambio de estado |
| La asignación manual de un `NUEVO` no pasa a `ASIGNADO` | P4 | Unit: `CAMBIO_ESTADO NUEVO→ASIGNADO` del actor; `EN_PROCESO` no cambia. Mutación: quitar la rama `NUEVO` pone el test en rojo |
| El listener filtra la autoasignación | P3 | Unit: asignado = actor (`autorId` = `asignadoId`) → `send` llamado |
| Un fallo de mail se propaga | Asignación reportada como fallida tras el commit | Unit: `send` lanza → el handler resuelve y loguea |

## Testing Strategy

| Capa | Qué | Cómo |
|---|---|---|
| Unit | Resolver (tabla de ADR-2), evaluador, `operacionesDeApertura`, las 3 altas (con y sin regla), las 2 asignaciones, los 2 casos de uso de configuración, plantilla (escape, los dos orígenes), listener | Vitest, puertos mockeados. **Mocks completos**: las 3 altas suman un parámetro de constructor; correr `node scripts/check-casts-en-specs.mjs` antes de integrar y no subir el contador |
| Integración | `PrismaReglaAsignacionRepository` (PK única, upsert, FK con cascada, `quitar` idempotente); alta con regla atómica y su rollback; preventivo anidado con regla (aplica, y un fallo de master no aborta el plan) | Postgres real (`soporte_tenant_test`), `TenantContext.run` + `PrismaTenantTransactionRunner` (molde `asignar-y-poner-en-proceso.reloj-sla.integration.spec.ts`). Aplicar M1 una vez a `soporte_tenant_test` antes de correr. Todo spec que trunque `soporte_master_test` llama `usarLockMasterTest()` |
| E2E | `reglas-asignacion.e2e.spec.ts` (403 TECNICO, 422 ADMIN como responsable, 404 tipo, estados `SIN_REGLA`/`VALIDA`/`ROTA`); un caso con regla por canal: `tickets.e2e`, Soporte, Edilicia (`reparaciones.e2e`), formulario público (`pedido-publico-confirmar.e2e`); `PATCH /asignar` en `CERRADO` → 422 y en `NUEVO` → `ASIGNADO` | Tenant efímero; **`usarLockMasterTest()`** en el spec nuevo |
| Frontend | Schemas, vista admin (badge, "Sin regla" → `null`, responsable roto deshabilitado), ítem del nav, `puedeReasignar` por estado, `TicketReasignarControl` | Vitest + Testing Library + msw |

- No se afirma un orden entre la apertura y la `ASIGNACION`: las dos toman `createdAt` de JS en el
  mismo milisegundo posible (`listByTicket` ordena por `created_at`). Los tests buscan por tipo de
  operación, no por posición.

## Threat Matrix

N/A: el cambio no toca enrutamiento, comandos de shell, subprocesos, automatización de VCS/PR,
clasificación de ejecutables ni integración de procesos. Los riesgos de autorización y aislamiento
están en "Autorización: los dos lugares donde vive".

## Migration / Rollout

| # | Contenido | Rollback |
|---|---|---|
| M1 `prisma_tenant/migrations/20261009120000_reglas_asignacion` | Tabla de ADR-1 | `rollback.sql`: `DROP TABLE IF EXISTS "reglas_asignacion"` |

- **Despliegue**: M1 viaja en el fan-out normal de `migrate:tenants` dentro de la ventana
  `Stop-Service`/`Start-Service` del runbook, con el dump previo estándar
  (`predeploy-dump.ps1`). Es aditiva y no destructiva.
- **Sin dependencias nuevas**: no cambia `pnpm-lock.yaml` ni hay variables de entorno nuevas.
- **Conducta al desplegar**: sin reglas cargadas, el alta queda igual que hoy. Lo que cambia desde el
  primer minuto es lo manual: bloqueo en terminales (P2), `NUEVO → ASIGNADO` (P4) y mail en cada
  asignación (D7).
- **Mitigación rápida sin revert**: vaciar las reglas desde la pantalla, o
  `DELETE FROM reglas_asignacion` por tenant. El alta vuelve a Nuevo; P2, P4 y D7 siguen.
- **Revert total**: `git revert` de la cadena en orden inverso + `rollback.sql` por tenant. Los
  tickets que nacieron `ASIGNADO` siguen siendo válidos (estado y operaciones existentes); el
  centinela `AUTOR_SISTEMA` queda como un autor sin nombre, igual que el del formulario público.
- **Deuda de Ayuda** (suspendida desde el 2026-09-07), anotar en commits y PR: pantalla nueva,
  asignación automática al crear, mail de asignación, `NUEVO → ASIGNADO` al asignar a mano, control
  de reasignación.

## Delivery slices (`auto-chain`, un PR por WU, presupuesto 400)

| WU | Alcance (código + tests juntos) | Depende de | Líneas |
|---|---|---|---|
| 1 | M1, Prisma, puerto, repo, evaluador (ADR-5), integración del repo | — | ~280 |
| 2 | `AUTOR_SISTEMA`, `TicketAsignadoEvent`, resolver, `operacionesDeApertura`, `CrearTicketUseCase` (cubre preventivo), cableado en `TicketsModule` | 1 | ~380 |
| 3 | Soporte (incluye formulario público) y Edilicia, cableado en sus módulos, e2e por canal | 2 | ~330 |
| 4 | Módulo `reglas-asignacion` (listar, configurar, controller, DTOs) + e2e | 1 | ~390 |
| 5 | `AsignarTicketUseCase` (terminal, P4, evento), guarda terminal y evento en `AsignarYPonerEnProceso`, mapeo 422, comentarios | 2 | ~300 |
| 6 | Plantilla + listener + cableado en `NotificacionesModule` | 2 | ~220 |
| 7 | Frontend: pantalla, hooks, Zod, ítem del nav | 4 | ~390 |
| 8 | Frontend: `TicketReasignarControl` + viñeta del roadmap "Cumplida" o "Desviación" | 5 | ~200 |

Orden: 1, 2, 3, 4, 5, 6, 7, 8. Cada WU queda en verde sola. Entre la WU 2 y la WU 6 el evento se
publica sin listener: es inocuo.

## Open Questions

Ninguna abierta. Resuelta: la reasignación simple se ofrece en todos los estados abiertos (ADR-10).

## Nota de reconciliación con las specs

- `ticket-asignacion-manual` M4 (y su escenario "Nuevo o asignado") lista la reasignación simple solo
  en `EN_PROCESO`, `ESPERANDO_CLIENTE` y `RESUELTO`. Este diseño la ofrece también en `NUEVO` y
  `ASIGNADO`, por decisión del dueño; la spec debe enmendarse.
- `asignacion-automatica-alta` A7 dice que "un fallo de las consultas de resolución NO DEBE abortar la
  transacción por plan". Se cumple para las consultas al maestro. Una consulta del tenant que falla
  dentro de la transacción la deja abortada en Postgres, así que se propaga (ADR-2); la spec debe
  precisar "consultas al maestro".
