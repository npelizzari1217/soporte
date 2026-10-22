import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SectoresModule } from '../sectores/sectores.module';
import { ISectorRepository, SECTOR_REPOSITORY } from '../sectores/domain/ports/i-sector.repository';
import {
  USUARIO_MASTER_CHECKER,
  IUsuarioMasterChecker,
} from './domain/ports/i-usuario-master.checker';
import { UsuarioMasterChecker } from './infrastructure/persistence/prisma/usuario-master.checker';
import { ESTADO_REPOSITORY, IEstadoRepository } from './domain/ports/i-estado.repository';
import {
  BLOQUEO_TICKET_REPOSITORY,
  IBloqueoTicketRepository,
} from './domain/ports/i-bloqueo-ticket.repository';
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
import { PrismaPrimeraRespuestaWriteRepository } from './infrastructure/persistence/prisma/prisma-primera-respuesta-write.repository';
import {
  PRIMERA_RESPUESTA_WRITE_REPOSITORY,
  IPrimeraRespuestaWriteRepository,
} from './domain/ports/i-primera-respuesta-write.repository';
import { PrismaRelojSlaMarcador } from './infrastructure/persistence/prisma/prisma-reloj-sla-marcador';
import { PrismaTicketRepository } from './infrastructure/persistence/prisma/prisma-ticket.repository';
import { PrismaReglaAsignacionRepository } from './infrastructure/persistence/prisma/prisma-regla-asignacion.repository';
import {
  IReglaAsignacionRepository,
  REGLA_ASIGNACION_REPOSITORY,
} from './domain/ports/i-regla-asignacion.repository';
import { PrismaPermisoTipoTicketRepository } from './infrastructure/persistence/prisma/prisma-permiso-tipo-ticket.repository';
import {
  IPermisoTipoTicketRepository,
  PERMISO_TIPO_TICKET_REPOSITORY,
} from './domain/ports/i-permiso-tipo-ticket.repository';
import { CargadorAlcanceTicket } from './interface/alcance-ticket';
import { ResolverAsignacionAutomatica } from './application/services/resolver-asignacion-automatica.service';
import { ElegibilidadAsignado } from './application/services/elegibilidad-asignado';
import {
  ITareaTicketRepository,
  TAREA_TICKET_REPOSITORY,
} from './domain/ports/i-tarea-ticket.repository';
import { PrismaTareaTicketRepository } from './infrastructure/persistence/prisma/prisma-tarea-ticket.repository';
import { PrismaBloqueoTicketRepository } from './infrastructure/persistence/prisma/prisma-bloqueo-ticket.repository';
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
import { ReanudarPorComentarioListener } from './infrastructure/listeners/reanudar-por-comentario.listener';
import { LOGGER, ILogger } from '../shared/domain/ports/i-logger.port';
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
import { ObtenerPermisosPorTipoUseCase } from './application/use-cases/obtener-permisos-por-tipo.use-case';
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
import { CrearTareaTicketUseCase } from './application/use-cases/crear-tarea-ticket.use-case';
import { AsignarTecnicoTareaUseCase } from './application/use-cases/asignar-tecnico-tarea.use-case';
import { CompletarTareaUseCase } from './application/use-cases/completar-tarea.use-case';
import { AvanzarEstadoPorTareasService } from './application/services/avanzar-estado-por-tareas.service';
import { VerificadorTicketEditable } from './application/services/ticket-editable-para-tareas';
import { DescompletarTareaUseCase } from './application/use-cases/descompletar-tarea.use-case';
import { EliminarTareaUseCase } from './application/use-cases/eliminar-tarea.use-case';
import { ListarTareasTicketUseCase } from './application/use-cases/listar-tareas-ticket.use-case';
import { ListarTecnicosElegiblesTareaUseCase } from './application/use-cases/listar-tecnicos-elegibles-tarea.use-case';
import { TicketsController } from './interface/controllers/tickets.controller';
import { AdjuntosController } from './interface/controllers/adjuntos.controller';
import { CatalogosController } from './interface/controllers/catalogos.controller';
import { TareasTicketController } from './interface/controllers/tareas-ticket.controller';
import { CalendarioLaboralModule } from '../calendario-laboral/calendario-laboral.module';
import { CalcularSlaHabilVenceService } from '../calendario-laboral/domain/services/calcular-sla-habil-vence.service';
import {
  CALENDARIO_LABORAL_SEMANAL_REPOSITORY,
  ICalendarioLaboralSemanalRepository,
} from '../calendario-laboral/domain/ports/i-calendario-laboral-semanal.repository';
import {
  FERIADOS_LABORALES_REPOSITORY,
  IFeriadosLaboralesRepository,
} from '../calendario-laboral/domain/ports/i-feriados-laborales.repository';

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
 *   (`TicketsController`). `CrearComentarioUseCase` importa además
 *   `CalendarioLaboralModule` (que solo importa `AuthModule`: sin ciclo) para
 *   guardar la primera respuesta en segundos hábiles (odd/promedios-dashboard-habiles).
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
  imports: [AuthModule, CsatLecturaModule, CalendarioLaboralModule, SectoresModule],
  controllers: [TicketsController, AdjuntosController, CatalogosController, TareasTicketController],
  providers: [
    { provide: USUARIO_MASTER_CHECKER, useClass: UsuarioMasterChecker },
    { provide: ESTADO_REPOSITORY, useClass: PrismaEstadoRepository },
    { provide: PRIORIDAD_REPOSITORY, useClass: PrismaPrioridadRepository },
    { provide: TIPO_TICKET_REPOSITORY, useClass: PrismaTipoTicketRepository },
    { provide: TIPO_OPERACION_REPOSITORY, useClass: PrismaTipoOperacionRepository },
    { provide: TICKET_REPOSITORY, useClass: PrismaTicketRepository },
    { provide: OPERACION_TICKET_REPOSITORY, useClass: PrismaOperacionTicketRepository },
    { provide: RELOJ_SLA_MARCADOR, useClass: PrismaRelojSlaMarcador },
    {
      provide: PRIMERA_RESPUESTA_WRITE_REPOSITORY,
      useClass: PrismaPrimeraRespuestaWriteRepository,
    },
    { provide: ARCHIVO_REPOSITORY, useClass: PrismaArchivoRepository },
    { provide: CICLO_CLIENTE_REPOSITORY, useClass: PrismaCicloClienteRepository },
    { provide: SOLICITANTE_EXTERNO_REPOSITORY, useClass: PrismaSolicitanteExternoRepository },
    { provide: REGLA_ASIGNACION_REPOSITORY, useClass: PrismaReglaAsignacionRepository },
    // odd/permisos-por-tipo-ticket (T4a): permisos por tipo y acción, locales al tenant.
    { provide: PERMISO_TIPO_TICKET_REPOSITORY, useClass: PrismaPermisoTipoTicketRepository },
    // odd/permisos-por-tipo-ticket (T5a): alcance por tipo del actor, cargado por request.
    CargadorAlcanceTicket,
    // odd/tareas-con-tecnico: tareas de cualquier tipo de ticket.
    { provide: TAREA_TICKET_REPOSITORY, useClass: PrismaTareaTicketRepository },
    // odd/ticket-cerrado-solo-lectura: tareas de solo lectura en CERRADO/CANCELADO o bloqueada por compra.
    { provide: BLOQUEO_TICKET_REPOSITORY, useClass: PrismaBloqueoTicketRepository },
    {
      provide: VerificadorTicketEditable,
      useFactory: (estadoRepo: IEstadoRepository, bloqueoRepo: IBloqueoTicketRepository) =>
        new VerificadorTicketEditable(estadoRepo, bloqueoRepo),
      inject: [ESTADO_REPOSITORY, BLOQUEO_TICKET_REPOSITORY],
    },

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
    // odd/permisos-por-tipo-ticket (D5 g): única regla de quién puede recibir un ticket o una tarea
    // de un tipo; master aporta rol y membresía, el tenant la LECTURA sobre el tipo.
    {
      provide: ElegibilidadAsignado,
      useFactory: (
        usuarioMasterChecker: IUsuarioMasterChecker,
        permisos: IPermisoTipoTicketRepository,
      ) => new ElegibilidadAsignado(usuarioMasterChecker, permisos),
      inject: [USUARIO_MASTER_CHECKER, PERMISO_TIPO_TICKET_REPOSITORY],
    },
    {
      provide: ResolverAsignacionAutomatica,
      useFactory: (
        reglaRepo: IReglaAsignacionRepository,
        elegibilidad: ElegibilidadAsignado,
        estadoRepo: IEstadoRepository,
        tipoOperacionRepo: ITipoOperacionRepository,
        logger: ILogger,
      ) =>
        new ResolverAsignacionAutomatica(
          reglaRepo,
          elegibilidad,
          estadoRepo,
          tipoOperacionRepo,
          logger,
        ),
      inject: [
        REGLA_ASIGNACION_REPOSITORY,
        ElegibilidadAsignado,
        ESTADO_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        LOGGER,
      ],
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
        resolverAsignacion: ResolverAsignacionAutomatica,
        eventPublisher: IDomainEventPublisher,
        txRunner: ITenantTransactionRunner,
        sectorRepo: ISectorRepository,
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
          resolverAsignacion,
          eventPublisher,
          txRunner,
          sectorRepo,
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
        ResolverAsignacionAutomatica,
        DOMAIN_EVENT_PUBLISHER,
        TENANT_TX_RUNNER,
        SECTOR_REPOSITORY,
      ],
    },
    {
      provide: ObtenerTicketUseCase,
      useFactory: (ticketRepo: ITicketRepository) => new ObtenerTicketUseCase(ticketRepo),
      inject: [TICKET_REPOSITORY],
    },
    {
      provide: ListarTicketsUseCase,
      useFactory: (ticketRepo: ITicketRepository, cicloRepo: ICicloClienteRepository) =>
        new ListarTicketsUseCase(ticketRepo, cicloRepo),
      inject: [TICKET_REPOSITORY, CICLO_CLIENTE_REPOSITORY],
    },
    {
      provide: EditarTicketUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        prioridadRepo: IPrioridadRepository,
        estadoRepo: IEstadoRepository,
        eventPublisher: IDomainEventPublisher,
        sectorRepo: ISectorRepository,
        txRunner: ITenantTransactionRunner,
      ) =>
        new EditarTicketUseCase(
          ticketRepo,
          prioridadRepo,
          estadoRepo,
          eventPublisher,
          sectorRepo,
          txRunner,
        ),
      inject: [
        TICKET_REPOSITORY,
        PRIORIDAD_REPOSITORY,
        ESTADO_REPOSITORY,
        DOMAIN_EVENT_PUBLISHER,
        SECTOR_REPOSITORY,
        TENANT_TX_RUNNER,
      ],
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
      // ADR-5: el solicitante que comenta en público reanuda un ticket en ESPERANDO_CLIENTE.
      provide: ReanudarPorComentarioListener,
      useFactory: (
        ticketRepo: ITicketRepository,
        estadoRepo: IEstadoRepository,
        transicionar: TransicionarEstadoUseCase,
        logger: ILogger,
      ) => new ReanudarPorComentarioListener(ticketRepo, estadoRepo, transicionar, logger),
      inject: [TICKET_REPOSITORY, ESTADO_REPOSITORY, TransicionarEstadoUseCase, LOGGER],
    },
    {
      provide: AsignarTicketUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        operacionRepo: IOperacionTicketRepository,
        usuarioMasterChecker: IUsuarioMasterChecker,
        elegibilidad: ElegibilidadAsignado,
        tipoOperacionRepo: ITipoOperacionRepository,
        txRunner: ITenantTransactionRunner,
        estadoRepo: IEstadoRepository,
        eventPublisher: IDomainEventPublisher,
      ) =>
        new AsignarTicketUseCase(
          ticketRepo,
          operacionRepo,
          usuarioMasterChecker,
          elegibilidad,
          tipoOperacionRepo,
          txRunner,
          estadoRepo,
          eventPublisher,
        ),
      inject: [
        TICKET_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        USUARIO_MASTER_CHECKER,
        ElegibilidadAsignado,
        TIPO_OPERACION_REPOSITORY,
        TENANT_TX_RUNNER,
        ESTADO_REPOSITORY,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: ListarTecnicosAsignablesUseCase,
      useFactory: (ticketRepo: ITicketRepository, elegibilidad: ElegibilidadAsignado) =>
        new ListarTecnicosAsignablesUseCase(ticketRepo, elegibilidad),
      inject: [TICKET_REPOSITORY, ElegibilidadAsignado],
    },
    // odd/tareas-con-tecnico T3: casos de uso de tareas (T2), cableados con `TareasTicketController`.
    // Crear se exporta para el seed de demo (`prisma_master/seeds/demo-seed.ts`). Completar y
    // eliminar se exportaban para las rutas de subtareas de reparaciones, que T8 retiró.
    {
      provide: ListarTareasTicketUseCase,
      useFactory: (ticketRepo: ITicketRepository, tareaRepo: ITareaTicketRepository) =>
        new ListarTareasTicketUseCase(ticketRepo, tareaRepo),
      inject: [TICKET_REPOSITORY, TAREA_TICKET_REPOSITORY],
    },
    {
      provide: ListarTecnicosElegiblesTareaUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        tipoTicketRepo: ITipoTicketRepository,
        elegibilidad: ElegibilidadAsignado,
      ) => new ListarTecnicosElegiblesTareaUseCase(ticketRepo, tipoTicketRepo, elegibilidad),
      inject: [TICKET_REPOSITORY, TIPO_TICKET_REPOSITORY, ElegibilidadAsignado],
    },
    {
      provide: CrearTareaTicketUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        tipoTicketRepo: ITipoTicketRepository,
        tareaRepo: ITareaTicketRepository,
        operacionRepo: IOperacionTicketRepository,
        tipoOperacionRepo: ITipoOperacionRepository,
        txRunner: ITenantTransactionRunner,
        verificadorEditable: VerificadorTicketEditable,
      ) =>
        new CrearTareaTicketUseCase(
          ticketRepo,
          tipoTicketRepo,
          tareaRepo,
          operacionRepo,
          tipoOperacionRepo,
          txRunner,
          verificadorEditable,
        ),
      inject: [
        TICKET_REPOSITORY,
        TIPO_TICKET_REPOSITORY,
        TAREA_TICKET_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        TENANT_TX_RUNNER,
        VerificadorTicketEditable,
      ],
    },
    {
      provide: AsignarTecnicoTareaUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        tipoTicketRepo: ITipoTicketRepository,
        tareaRepo: ITareaTicketRepository,
        elegibilidad: ElegibilidadAsignado,
        operacionRepo: IOperacionTicketRepository,
        tipoOperacionRepo: ITipoOperacionRepository,
        txRunner: ITenantTransactionRunner,
        verificadorEditable: VerificadorTicketEditable,
      ) =>
        new AsignarTecnicoTareaUseCase(
          ticketRepo,
          tipoTicketRepo,
          tareaRepo,
          elegibilidad,
          operacionRepo,
          tipoOperacionRepo,
          txRunner,
          verificadorEditable,
        ),
      inject: [
        TICKET_REPOSITORY,
        TIPO_TICKET_REPOSITORY,
        TAREA_TICKET_REPOSITORY,
        ElegibilidadAsignado,
        OPERACION_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        TENANT_TX_RUNNER,
        VerificadorTicketEditable,
      ],
    },
    {
      // odd/estado-por-tareas: el estado del ticket sigue a sus tareas, dentro de la tx de la tarea.
      provide: AvanzarEstadoPorTareasService,
      useFactory: (
        ticketRepo: ITicketRepository,
        tareaRepo: ITareaTicketRepository,
        operacionRepo: IOperacionTicketRepository,
        estadoRepo: IEstadoRepository,
        tipoTicketRepo: ITipoTicketRepository,
        tipoOperacionRepo: ITipoOperacionRepository,
        stateMachineFactory: TicketStateMachineFactory,
        relojMarcador: IRelojSlaMarcador,
        eventPublisher: IDomainEventPublisher,
        txRunner: ITenantTransactionRunner,
      ) =>
        new AvanzarEstadoPorTareasService(
          ticketRepo,
          tareaRepo,
          operacionRepo,
          estadoRepo,
          tipoTicketRepo,
          tipoOperacionRepo,
          stateMachineFactory,
          relojMarcador,
          eventPublisher,
          txRunner,
        ),
      inject: [
        TICKET_REPOSITORY,
        TAREA_TICKET_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        ESTADO_REPOSITORY,
        TIPO_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        TicketStateMachineFactory,
        RELOJ_SLA_MARCADOR,
        DOMAIN_EVENT_PUBLISHER,
        TENANT_TX_RUNNER,
      ],
    },
    {
      provide: CompletarTareaUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        tareaRepo: ITareaTicketRepository,
        operacionRepo: IOperacionTicketRepository,
        tipoOperacionRepo: ITipoOperacionRepository,
        txRunner: ITenantTransactionRunner,
        avanzarEstado: AvanzarEstadoPorTareasService,
        verificadorEditable: VerificadorTicketEditable,
      ) =>
        new CompletarTareaUseCase(
          ticketRepo,
          tareaRepo,
          operacionRepo,
          tipoOperacionRepo,
          txRunner,
          avanzarEstado,
          verificadorEditable,
        ),
      inject: [
        TICKET_REPOSITORY,
        TAREA_TICKET_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        TENANT_TX_RUNNER,
        AvanzarEstadoPorTareasService,
        VerificadorTicketEditable,
      ],
    },
    {
      provide: DescompletarTareaUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        tareaRepo: ITareaTicketRepository,
        operacionRepo: IOperacionTicketRepository,
        tipoOperacionRepo: ITipoOperacionRepository,
        txRunner: ITenantTransactionRunner,
        avanzarEstado: AvanzarEstadoPorTareasService,
        verificadorEditable: VerificadorTicketEditable,
      ) =>
        new DescompletarTareaUseCase(
          ticketRepo,
          tareaRepo,
          operacionRepo,
          tipoOperacionRepo,
          txRunner,
          avanzarEstado,
          verificadorEditable,
        ),
      inject: [
        TICKET_REPOSITORY,
        TAREA_TICKET_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        TENANT_TX_RUNNER,
        AvanzarEstadoPorTareasService,
        VerificadorTicketEditable,
      ],
    },
    {
      provide: EliminarTareaUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        tipoTicketRepo: ITipoTicketRepository,
        tareaRepo: ITareaTicketRepository,
        operacionRepo: IOperacionTicketRepository,
        tipoOperacionRepo: ITipoOperacionRepository,
        txRunner: ITenantTransactionRunner,
        verificadorEditable: VerificadorTicketEditable,
      ) =>
        new EliminarTareaUseCase(
          ticketRepo,
          tipoTicketRepo,
          tareaRepo,
          operacionRepo,
          tipoOperacionRepo,
          txRunner,
          verificadorEditable,
        ),
      inject: [
        TICKET_REPOSITORY,
        TIPO_TICKET_REPOSITORY,
        TAREA_TICKET_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        TENANT_TX_RUNNER,
        VerificadorTicketEditable,
      ],
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
        elegibilidad: ElegibilidadAsignado,
        stateMachineFactory: TicketStateMachineFactory,
        txRunner: ITenantTransactionRunner,
        eventPublisher: IDomainEventPublisher,
      ) =>
        new AsignarYPonerEnProcesoUseCase(
          ticketRepo,
          operacionRepo,
          estadoRepo,
          tipoTicketRepo,
          tipoOperacionRepo,
          usuarioMasterChecker,
          elegibilidad,
          stateMachineFactory,
          txRunner,
          eventPublisher,
        ),
      inject: [
        TICKET_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        ESTADO_REPOSITORY,
        TIPO_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        USUARIO_MASTER_CHECKER,
        ElegibilidadAsignado,
        TicketStateMachineFactory,
        TENANT_TX_RUNNER,
        DOMAIN_EVENT_PUBLISHER,
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
        txRunner: ITenantTransactionRunner,
        primeraRespuestaRepo: IPrimeraRespuestaWriteRepository,
        calendarioRepo: ICalendarioLaboralSemanalRepository,
        feriadosRepo: IFeriadosLaboralesRepository,
        logger: ILogger,
      ) =>
        new CrearComentarioUseCase(
          ticketRepo,
          operacionRepo,
          estadoRepo,
          tipoOperacionRepo,
          eventPublisher,
          txRunner,
          primeraRespuestaRepo,
          new CalcularSlaHabilVenceService(),
          calendarioRepo,
          feriadosRepo,
          logger,
        ),
      inject: [
        TICKET_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        ESTADO_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        DOMAIN_EVENT_PUBLISHER,
        TENANT_TX_RUNNER,
        PRIMERA_RESPUESTA_WRITE_REPOSITORY,
        CALENDARIO_LABORAL_SEMANAL_REPOSITORY,
        FERIADOS_LABORALES_REPOSITORY,
        LOGGER,
      ],
    },
    // odd/permisos-por-tipo-ticket (T6): acciones por tipo de la sesión, para el frontend.
    {
      provide: ObtenerPermisosPorTipoUseCase,
      useFactory: (permisos: IPermisoTipoTicketRepository) =>
        new ObtenerPermisosPorTipoUseCase(permisos),
      inject: [PERMISO_TIPO_TICKET_REPOSITORY],
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
      useFactory: (
        tipoTicketRepo: ITipoTicketRepository,
        permisos: IPermisoTipoTicketRepository,
        txRunner: ITenantTransactionRunner,
      ) => new CrearTipoTicketUseCase(tipoTicketRepo, permisos, txRunner),
      inject: [TIPO_TICKET_REPOSITORY, PERMISO_TIPO_TICKET_REPOSITORY, TENANT_TX_RUNNER],
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
    // odd/permisos-por-tipo-ticket (T5a): las operaciones por id de Equipos, el PDF y la API v1
    // cargan el alcance por tipo con el mismo cargador.
    CargadorAlcanceTicket,
    ESTADO_REPOSITORY,
    // odd/ticket-cerrado-solo-lectura: la misma regla frena los comentarios de reparación.
    VerificadorTicketEditable,
    PRIORIDAD_REPOSITORY,
    TIPO_TICKET_REPOSITORY,
    TIPO_OPERACION_REPOSITORY,
    TICKET_REPOSITORY,
    OPERACION_TICKET_REPOSITORY,
    PRIMERA_RESPUESTA_WRITE_REPOSITORY,
    ARCHIVO_REPOSITORY,
    CICLO_CLIENTE_REPOSITORY,
    SOLICITANTE_EXTERNO_REPOSITORY,
    // sdd/asignacion-automatica-por-tipo: la regla y su resolver los consumen las altas de otros
    // módulos (Equipos, Reparaciones) y la pantalla de configuración.
    REGLA_ASIGNACION_REPOSITORY,
    ResolverAsignacionAutomatica,
    // odd/permisos-por-tipo-ticket (D5 g): la pantalla de reglas valida el responsable con la misma
    // elegibilidad que el alta.
    ElegibilidadAsignado,
    // odd/tareas-con-tecnico: las tareas las leen también el listado de reparaciones, el dashboard
    // y el PDF, que viven en otros módulos.
    TAREA_TICKET_REPOSITORY,
    // odd/tareas-con-tecnico T3: las rutas de subtareas de reparaciones delegan en estos tres hasta
    // que T8 las retire.
    CrearTareaTicketUseCase,
    CompletarTareaUseCase,
    EliminarTareaUseCase,
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
    // La API pública v1 (`ApiV1Module`) usa estos cinco tal cual: una sola fábrica,
    // la de acá, así un cambio de dependencias no hay que repetirlo allá.
    ListarTicketsUseCase,
    CrearComentarioUseCase,
    ListarTiposTicketUseCase,
    ListarPrioridadesUseCase,
    ListarEstadosUseCase,
  ],
})
export class TicketsModule {}
