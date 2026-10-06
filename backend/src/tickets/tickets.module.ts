import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  USUARIO_MASTER_CHECKER,
  IUsuarioMasterChecker,
} from './domain/ports/i-usuario-master.checker';
import { UsuarioMasterChecker } from './infrastructure/persistence/prisma/usuario-master.checker';
import { ESTADO_REPOSITORY, IEstadoRepository } from './domain/ports/i-estado.repository';
import { PrismaEstadoRepository } from './infrastructure/persistence/prisma/prisma-estado.repository';
import { PRIORIDAD_REPOSITORY, IPrioridadRepository } from './domain/ports/i-prioridad.repository';
import { PrismaPrioridadRepository } from './infrastructure/persistence/prisma/prisma-prioridad.repository';
import {
  TIPO_TICKET_REPOSITORY,
  ITipoTicketRepository,
} from './domain/ports/i-tipo-ticket.repository';
import { PrismaTipoTicketRepository } from './infrastructure/persistence/prisma/prisma-tipo-ticket.repository';
import {
  TIPO_OPERACION_REPOSITORY,
  ITipoOperacionRepository,
} from './domain/ports/i-tipo-operacion.repository';
import { PrismaTipoOperacionRepository } from './infrastructure/persistence/prisma/prisma-tipo-operacion.repository';
import { TICKET_REPOSITORY, ITicketRepository } from './domain/ports/i-ticket.repository';
import { RELOJ_SLA_MARCADOR, IRelojSlaMarcador } from './domain/ports/i-reloj-sla-marcador';
import { PrismaRelojSlaMarcador } from './infrastructure/persistence/prisma/prisma-reloj-sla-marcador';
import { PrismaTicketRepository } from './infrastructure/persistence/prisma/prisma-ticket.repository';
import {
  OPERACION_TICKET_REPOSITORY,
  IOperacionTicketRepository,
} from './domain/ports/i-operacion-ticket.repository';
import { PrismaOperacionTicketRepository } from './infrastructure/persistence/prisma/prisma-operacion-ticket.repository';
import { ARCHIVO_REPOSITORY, IArchivoRepository } from './domain/ports/i-archivo.repository';
import { PrismaArchivoRepository } from './infrastructure/persistence/prisma/prisma-archivo.repository';
import {
  CICLO_CLIENTE_REPOSITORY,
  ICicloClienteRepository,
} from './domain/ports/i-ciclo-cliente.repository';
import { SOLICITANTE_EXTERNO_REPOSITORY } from './domain/ports/i-solicitante-externo.repository';
import { PrismaSolicitanteExternoRepository } from './infrastructure/persistence/prisma/prisma-solicitante-externo.repository';
import { PrismaCicloClienteRepository } from './infrastructure/persistence/prisma/prisma-ciclo-cliente.repository';
import { CsatLecturaModule } from '../csat/csat-lectura.module';

import { NumeradorTicket } from './domain/services/numerador-ticket.service';
import { ResolverCicloActivoParaCreacion } from './application/services/resolver-ciclo-activo.service';
import {
  ITenantTransactionRunner,
  TENANT_TX_RUNNER,
} from '../shared/infrastructure/persistence/tenant-transaction-runner';
import {
  IDomainEventPublisher,
  DOMAIN_EVENT_PUBLISHER,
} from '../shared/domain/ports/i-domain-event-publisher';
import { IFileStorage, FILE_STORAGE } from '../shared/domain/ports/i-file-storage';
import { TicketStateMachineFactory } from './domain/state-machine/ticket-state-machine.factory';

import { CrearTicketUseCase } from './application/use-cases/crear-ticket.use-case';
import { ObtenerTicketUseCase } from './application/use-cases/obtener-ticket.use-case';
import { ListarTicketsUseCase } from './application/use-cases/listar-tickets.use-case';
import { EditarTicketUseCase } from './application/use-cases/editar-ticket.use-case';
import { TransicionarEstadoUseCase } from './application/use-cases/transicionar-estado.use-case';
import { AsignarTicketUseCase } from './application/use-cases/asignar-ticket.use-case';
import { AsignarYPonerEnProcesoUseCase } from './application/use-cases/asignar-y-poner-en-proceso.use-case';
import { ListarTecnicosAsignablesUseCase } from './application/use-cases/listar-tecnicos-asignables.use-case';
import { CrearComentarioUseCase } from './application/use-cases/crear-comentario.use-case';
import { ListarTimelineUseCase } from './application/use-cases/listar-timeline.use-case';
import { AdjuntarArchivoUseCase } from './application/use-cases/adjuntar-archivo.use-case';
import { CrearTipoTicketUseCase } from './application/use-cases/crear-tipo-ticket.use-case';
import { EditarTipoTicketUseCase } from './application/use-cases/editar-tipo-ticket.use-case';
import { CambiarEstadoActivoTipoTicketUseCase } from './application/use-cases/cambiar-estado-activo-tipo-ticket.use-case';
import { CrearPrioridadUseCase } from './application/use-cases/crear-prioridad.use-case';
import { EditarPrioridadUseCase } from './application/use-cases/editar-prioridad.use-case';
import { CambiarEstadoActivoPrioridadUseCase } from './application/use-cases/cambiar-estado-activo-prioridad.use-case';
import { ListarTiposTicketUseCase } from './application/use-cases/listar-tipos-ticket.use-case';
import { ListarPrioridadesUseCase } from './application/use-cases/listar-prioridades.use-case';
import { ListarEstadosUseCase } from './application/use-cases/listar-estados.use-case';
import { ListarTiposOperacionUseCase } from './application/use-cases/listar-tipos-operacion.use-case';
import { ExportarTicketsUseCase } from './application/use-cases/exportar-tickets.use-case';
import { TicketsController } from './interface/controllers/tickets.controller';
import { AdjuntosController } from './interface/controllers/adjuntos.controller';
import { CatalogosController } from './interface/controllers/catalogos.controller';

/**
 * TicketsModule — módulo NestJS del dominio "tickets".
 *
 * Núcleo de tickets: creación, timeline de operaciones, adjuntos, referencias entre tickets.
 *
 * Wiring incremental por PR (arquitectura hexagonal: domain/ → application/ →
 * infrastructure/ → interface/):
 * - PR1 (Fase 2): USUARIO_MASTER_CHECKER → UsuarioMasterChecker (cross-DB a
 *   master.usuarios/membresias, pull-forward de T5.5 — validación de soft
 *   refs solicitante/asignado, T14/T15). PrismaService disponible sin
 *   reimportar SharedModule (@Global(), ver shared.module.ts).
 * - PR2 (Fase 2): repos SOLO LECTURA de catálogos (Estado/Prioridad/
 *   TipoTicket/TipoOperacion), T1/T2. El CRUD de escritura de tipos_ticket/
 *   prioridades llega en PR11.
 * - PR5 (Fase 2): TICKET_REPOSITORY, OPERACION_TICKET_REPOSITORY,
 *   ARCHIVO_REPOSITORY (alcance ampliado, adelantado desde PR10 a pedido
 *   explícito de esta sesión) y CICLO_CLIENTE_REPOSITORY — persistencia
 *   del núcleo de tickets + numeración correlativa concurrente (ADR-5).
 * - PR6 (Fase 2): CRUD lectura/creación. `NumeradorTicket` y
 *   `ResolverCicloActivoParaCreacion` son clases planas (sin `@Injectable`)
 *   — se registran vía `useFactory` inyectando sus puertos por token,
 *   igual que los 4 use cases (`CrearTicketUseCase`, `ObtenerTicketUseCase`,
 *   `ListarTicketsUseCase`, `EditarTicketUseCase`). `TICKET_TX_RUNNER`
 *   (`ITenantTransactionRunner`) se inyecta desde `SharedModule` (`@Global`,
 *   sin necesidad de reimportarlo acá). `TicketsController` expone
 *   `POST/GET/GET:id/PATCH:id /tickets`.
 * - PR7 (Fase 2): `TransicionarEstadoUseCase` (T9/T10/T12/T13) +
 *   `TicketStateMachineFactory`. Endpoint `PATCH /tickets/:id/estado`.
 * - PR8 (Fase 2): `AsignarTicketUseCase` (T14/T15, reusa `USUARIO_MASTER_CHECKER`
 *   de PR1). Endpoint `PATCH /tickets/:id/asignar` (`TicketsController`).
 *   La elegibilidad de asignación se resuelve por el módulo del catálogo del
 *   `TipoTicket` (vía `TIPO_TICKET_REPOSITORY`), no por una tabla de routing
 *   usuario↔tipo dedicada.
 * - PR9 (Fase 2): `CrearComentarioUseCase` (T16/T17, reusa `ESTADO_REPOSITORY`
 *   + `TIPO_OPERACION_REPOSITORY`/`DOMAIN_EVENT_PUBLISHER` ya registrados) +
 *   `ListarTimelineUseCase` (T18, reusa `TICKET_REPOSITORY`/
 *   `OPERACION_TICKET_REPOSITORY`, sin providers nuevos). Endpoints
 *   `POST /tickets/:id/comentarios` y `GET /tickets/:id/timeline`
 *   (`TicketsController`).
 * - PR10 (Fase 2): `AdjuntarArchivoUseCase` (T20/T21/T22, reusa
 *   `ARCHIVO_REPOSITORY`/`TICKET_REPOSITORY`/`OPERACION_TICKET_REPOSITORY`/
 *   `TIPO_OPERACION_REPOSITORY` ya registrados desde PR2/PR5 + `FILE_STORAGE`
 *   de `SharedModule`, `@Global`). Endpoints `POST /tickets/:id/adjuntos` y
 *   `POST /operaciones/:id/adjuntos` (`AdjuntosController`, controller
 *   nuevo con `@Controller()` sin prefijo: `/operaciones` no cuelga de
 *   `/tickets`).
 * - PR11 (Fase 2): CRUD editable de catálogos (T2 — `tipos_ticket`/
 *   `prioridades`; `estados` permanece FIJO, sin CRUD). Reusa
 *   `TIPO_TICKET_REPOSITORY`/`PRIORIDAD_REPOSITORY` ya registrados desde
 *   PR2 (ambos repos ahora implementan también `save()`, T11.1/T11.2).
 *   `CrearTipoTicketUseCase`/`EditarTipoTicketUseCase` validan además la
 *   ausencia de colisión de prefijo de numeración derivado (ADR-4) contra
 *   los tipos ACTIVOS del tenant. Endpoints en `CatalogosController`
 *   (controller nuevo), TODOS protegidos por `catalogo:gestionar`
 *   (EXCLUSIVO ADMINISTRADOR, migración de PR2 — desvía ADR-2 que
 *   proponía reusar `cliente:gestionar`, por decisión explícita).
 *
 * FITNESS RULE: PrismaService y @prisma/client solo pueden importarse desde
 * infrastructure/ (ver backend/eslint.config.js).
 */
@Module({
  imports: [AuthModule, CsatLecturaModule],
  controllers: [TicketsController, AdjuntosController, CatalogosController],
  providers: [
    { provide: USUARIO_MASTER_CHECKER, useClass: UsuarioMasterChecker },
    { provide: ESTADO_REPOSITORY, useClass: PrismaEstadoRepository },
    { provide: PRIORIDAD_REPOSITORY, useClass: PrismaPrioridadRepository },
    { provide: TIPO_TICKET_REPOSITORY, useClass: PrismaTipoTicketRepository },
    { provide: TIPO_OPERACION_REPOSITORY, useClass: PrismaTipoOperacionRepository },
    { provide: TICKET_REPOSITORY, useClass: PrismaTicketRepository },
    { provide: OPERACION_TICKET_REPOSITORY, useClass: PrismaOperacionTicketRepository },
    { provide: RELOJ_SLA_MARCADOR, useClass: PrismaRelojSlaMarcador },
    { provide: ARCHIVO_REPOSITORY, useClass: PrismaArchivoRepository },
    { provide: CICLO_CLIENTE_REPOSITORY, useClass: PrismaCicloClienteRepository },
    { provide: SOLICITANTE_EXTERNO_REPOSITORY, useClass: PrismaSolicitanteExternoRepository },

    {
      provide: NumeradorTicket,
      useFactory: (ticketRepo: ITicketRepository) => new NumeradorTicket(ticketRepo),
      inject: [TICKET_REPOSITORY],
    },
    {
      provide: ResolverCicloActivoParaCreacion,
      useFactory: (cicloRepo: ICicloClienteRepository) =>
        new ResolverCicloActivoParaCreacion(cicloRepo),
      inject: [CICLO_CLIENTE_REPOSITORY],
    },
    {
      provide: CrearTicketUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        operacionRepo: IOperacionTicketRepository,
        estadoRepo: IEstadoRepository,
        tipoTicketRepo: ITipoTicketRepository,
        prioridadRepo: IPrioridadRepository,
        tipoOperacionRepo: ITipoOperacionRepository,
        usuarioMasterChecker: IUsuarioMasterChecker,
        numerador: NumeradorTicket,
        resolverCicloActivo: ResolverCicloActivoParaCreacion,
        eventPublisher: IDomainEventPublisher,
        txRunner: ITenantTransactionRunner,
      ) =>
        new CrearTicketUseCase(
          ticketRepo,
          operacionRepo,
          estadoRepo,
          tipoTicketRepo,
          prioridadRepo,
          tipoOperacionRepo,
          usuarioMasterChecker,
          numerador,
          resolverCicloActivo,
          eventPublisher,
          txRunner,
        ),
      inject: [
        TICKET_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        ESTADO_REPOSITORY,
        TIPO_TICKET_REPOSITORY,
        PRIORIDAD_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        USUARIO_MASTER_CHECKER,
        NumeradorTicket,
        ResolverCicloActivoParaCreacion,
        DOMAIN_EVENT_PUBLISHER,
        TENANT_TX_RUNNER,
      ],
    },
    {
      provide: ObtenerTicketUseCase,
      useFactory: (ticketRepo: ITicketRepository) => new ObtenerTicketUseCase(ticketRepo),
      inject: [TICKET_REPOSITORY],
    },
    {
      provide: ListarTicketsUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        cicloRepo: ICicloClienteRepository,
        tipoTicketRepo: ITipoTicketRepository,
      ) => new ListarTicketsUseCase(ticketRepo, cicloRepo, tipoTicketRepo),
      inject: [TICKET_REPOSITORY, CICLO_CLIENTE_REPOSITORY, TIPO_TICKET_REPOSITORY],
    },
    {
      provide: EditarTicketUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        prioridadRepo: IPrioridadRepository,
        estadoRepo: IEstadoRepository,
        eventPublisher: IDomainEventPublisher,
      ) => new EditarTicketUseCase(ticketRepo, prioridadRepo, estadoRepo, eventPublisher),
      inject: [TICKET_REPOSITORY, PRIORIDAD_REPOSITORY, ESTADO_REPOSITORY, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: TicketStateMachineFactory,
      useFactory: () => new TicketStateMachineFactory(),
    },
    {
      provide: TransicionarEstadoUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        operacionRepo: IOperacionTicketRepository,
        estadoRepo: IEstadoRepository,
        tipoTicketRepo: ITipoTicketRepository,
        tipoOperacionRepo: ITipoOperacionRepository,
        stateMachineFactory: TicketStateMachineFactory,
        eventPublisher: IDomainEventPublisher,
        txRunner: ITenantTransactionRunner,
        relojMarcador: IRelojSlaMarcador,
      ) =>
        new TransicionarEstadoUseCase(
          ticketRepo,
          operacionRepo,
          estadoRepo,
          tipoTicketRepo,
          tipoOperacionRepo,
          stateMachineFactory,
          eventPublisher,
          txRunner,
          relojMarcador,
        ),
      inject: [
        TICKET_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        ESTADO_REPOSITORY,
        TIPO_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        TicketStateMachineFactory,
        DOMAIN_EVENT_PUBLISHER,
        TENANT_TX_RUNNER,
        RELOJ_SLA_MARCADOR,
      ],
    },
    {
      provide: AsignarTicketUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        operacionRepo: IOperacionTicketRepository,
        usuarioMasterChecker: IUsuarioMasterChecker,
        tipoTicketRepo: ITipoTicketRepository,
        tipoOperacionRepo: ITipoOperacionRepository,
        txRunner: ITenantTransactionRunner,
      ) =>
        new AsignarTicketUseCase(
          ticketRepo,
          operacionRepo,
          usuarioMasterChecker,
          tipoTicketRepo,
          tipoOperacionRepo,
          txRunner,
        ),
      inject: [
        TICKET_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        USUARIO_MASTER_CHECKER,
        TIPO_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        TENANT_TX_RUNNER,
      ],
    },
    {
      provide: ListarTecnicosAsignablesUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        tipoTicketRepo: ITipoTicketRepository,
        usuarioMasterChecker: IUsuarioMasterChecker,
      ) => new ListarTecnicosAsignablesUseCase(ticketRepo, tipoTicketRepo, usuarioMasterChecker),
      inject: [TICKET_REPOSITORY, TIPO_TICKET_REPOSITORY, USUARIO_MASTER_CHECKER],
    },
    {
      provide: AsignarYPonerEnProcesoUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        operacionRepo: IOperacionTicketRepository,
        estadoRepo: IEstadoRepository,
        tipoTicketRepo: ITipoTicketRepository,
        tipoOperacionRepo: ITipoOperacionRepository,
        usuarioMasterChecker: IUsuarioMasterChecker,
        stateMachineFactory: TicketStateMachineFactory,
        txRunner: ITenantTransactionRunner,
      ) =>
        new AsignarYPonerEnProcesoUseCase(
          ticketRepo,
          operacionRepo,
          estadoRepo,
          tipoTicketRepo,
          tipoOperacionRepo,
          usuarioMasterChecker,
          stateMachineFactory,
          txRunner,
        ),
      inject: [
        TICKET_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        ESTADO_REPOSITORY,
        TIPO_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        USUARIO_MASTER_CHECKER,
        TicketStateMachineFactory,
        TENANT_TX_RUNNER,
      ],
    },
    {
      provide: CrearComentarioUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        operacionRepo: IOperacionTicketRepository,
        estadoRepo: IEstadoRepository,
        tipoOperacionRepo: ITipoOperacionRepository,
        eventPublisher: IDomainEventPublisher,
      ) =>
        new CrearComentarioUseCase(
          ticketRepo,
          operacionRepo,
          estadoRepo,
          tipoOperacionRepo,
          eventPublisher,
        ),
      inject: [
        TICKET_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        ESTADO_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: ListarTimelineUseCase,
      useFactory: (ticketRepo: ITicketRepository, operacionRepo: IOperacionTicketRepository) =>
        new ListarTimelineUseCase(ticketRepo, operacionRepo),
      inject: [TICKET_REPOSITORY, OPERACION_TICKET_REPOSITORY],
    },
    {
      provide: AdjuntarArchivoUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        operacionRepo: IOperacionTicketRepository,
        archivoRepo: IArchivoRepository,
        tipoOperacionRepo: ITipoOperacionRepository,
        fileStorage: IFileStorage,
        txRunner: ITenantTransactionRunner,
      ) =>
        new AdjuntarArchivoUseCase(
          ticketRepo,
          operacionRepo,
          archivoRepo,
          tipoOperacionRepo,
          fileStorage,
          txRunner,
        ),
      inject: [
        TICKET_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        ARCHIVO_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        FILE_STORAGE,
        TENANT_TX_RUNNER,
      ],
    },
    {
      provide: CrearTipoTicketUseCase,
      useFactory: (tipoTicketRepo: ITipoTicketRepository) =>
        new CrearTipoTicketUseCase(tipoTicketRepo),
      inject: [TIPO_TICKET_REPOSITORY],
    },
    {
      provide: EditarTipoTicketUseCase,
      useFactory: (tipoTicketRepo: ITipoTicketRepository) =>
        new EditarTipoTicketUseCase(tipoTicketRepo),
      inject: [TIPO_TICKET_REPOSITORY],
    },
    {
      provide: CambiarEstadoActivoTipoTicketUseCase,
      useFactory: (tipoTicketRepo: ITipoTicketRepository) =>
        new CambiarEstadoActivoTipoTicketUseCase(tipoTicketRepo),
      inject: [TIPO_TICKET_REPOSITORY],
    },
    {
      provide: CrearPrioridadUseCase,
      useFactory: (prioridadRepo: IPrioridadRepository) => new CrearPrioridadUseCase(prioridadRepo),
      inject: [PRIORIDAD_REPOSITORY],
    },
    {
      provide: EditarPrioridadUseCase,
      useFactory: (prioridadRepo: IPrioridadRepository) =>
        new EditarPrioridadUseCase(prioridadRepo),
      inject: [PRIORIDAD_REPOSITORY],
    },
    {
      provide: CambiarEstadoActivoPrioridadUseCase,
      useFactory: (prioridadRepo: IPrioridadRepository) =>
        new CambiarEstadoActivoPrioridadUseCase(prioridadRepo),
      inject: [PRIORIDAD_REPOSITORY],
    },
    {
      provide: ListarTiposTicketUseCase,
      useFactory: (tipoTicketRepo: ITipoTicketRepository) =>
        new ListarTiposTicketUseCase(tipoTicketRepo),
      inject: [TIPO_TICKET_REPOSITORY],
    },
    {
      provide: ListarPrioridadesUseCase,
      useFactory: (prioridadRepo: IPrioridadRepository) =>
        new ListarPrioridadesUseCase(prioridadRepo),
      inject: [PRIORIDAD_REPOSITORY],
    },
    {
      provide: ListarEstadosUseCase,
      useFactory: (estadoRepo: IEstadoRepository) => new ListarEstadosUseCase(estadoRepo),
      inject: [ESTADO_REPOSITORY],
    },
    {
      provide: ListarTiposOperacionUseCase,
      useFactory: (tipoOperacionRepo: ITipoOperacionRepository) =>
        new ListarTiposOperacionUseCase(tipoOperacionRepo),
      inject: [TIPO_OPERACION_REPOSITORY],
    },
    {
      // sdd/exportar-listados-csv (D4): compone `ListarTicketsUseCase` YA
      // registrado arriba — nunca un `ITicketRepository` propio — para
      // heredar el scope de filas (T6/T7) sin poder reimplementarlo mal.
      provide: ExportarTicketsUseCase,
      useFactory: (
        listarTicketsUseCase: ListarTicketsUseCase,
        estadoRepo: IEstadoRepository,
        prioridadRepo: IPrioridadRepository,
        usuarioMasterChecker: IUsuarioMasterChecker,
      ) =>
        new ExportarTicketsUseCase(
          listarTicketsUseCase,
          estadoRepo,
          prioridadRepo,
          usuarioMasterChecker,
        ),
      inject: [
        ListarTicketsUseCase,
        ESTADO_REPOSITORY,
        PRIORIDAD_REPOSITORY,
        USUARIO_MASTER_CHECKER,
      ],
    },
  ],
  exports: [
    USUARIO_MASTER_CHECKER,
    ESTADO_REPOSITORY,
    PRIORIDAD_REPOSITORY,
    TIPO_TICKET_REPOSITORY,
    TIPO_OPERACION_REPOSITORY,
    TICKET_REPOSITORY,
    OPERACION_TICKET_REPOSITORY,
    ARCHIVO_REPOSITORY,
    CICLO_CLIENTE_REPOSITORY,
    SOLICITANTE_EXTERNO_REPOSITORY,
    // sdd/preventivo WU-5 (5.1): CrearTicketUseCase exportado para que
    // GenerarPreventivosUseCase lo reuse en vez de reimplementar la sección
    // crítica de numeración (ADR-PV5) — mismo criterio que los tokens de
    // repositorio de arriba.
    CrearTicketUseCase,
    // La ficha PDF (`TicketPdfModule`) reusa el MISMO acceso que el detalle:
    // estos dos casos de uso deciden quién ve el ticket y su timeline, y
    // reimplementarlos allá abriría la puerta a divergir de esa regla.
    ObtenerTicketUseCase,
    ListarTimelineUseCase,
  ],
})
export class TicketsModule {}
