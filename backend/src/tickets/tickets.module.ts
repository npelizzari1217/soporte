/**
 * TicketsModule — módulo NestJS del dominio de tickets.
 *
 * Cablea todos los providers de la Fase 3 (tickets-core):
 * - Repositorios tenant (usan TenantContext, sin PrismaService directo).
 * - UsuarioMasterChecker (usa PrismaService de @Global SharedModule).
 * - Servicios de dominio: NumeradorTicket, TicketStateMachineFactory.
 * - Use cases (plain classes, instanciados via useFactory).
 * - Guards: RolesGuard, PermissionsGuard, TenantGuard.
 * - Importa AuthModule para obtener TOKEN_SERVICE + JwtAuthGuard exportados.
 * - Controllers: TicketsController, OperacionesController.
 *
 * NestJS DI notas:
 * - SharedModule es @Global → PrismaService, TenantContext, TENANT_TRANSACTION_RUNNER,
 *   FILE_STORAGE ya están disponibles sin importar SharedModule aquí.
 * - AuthModule exporta TOKEN_SERVICE + JwtAuthGuard → disponibles en este módulo.
 * - Los repos tenant reciben TenantContext via @Global.
 * - TicketStateMachineFactory: sin @Injectable(), instanciada via useFactory.
 *   Compras/Edilicia (Fases 4/5) llaman factory.register() en su propio wiring.
 * - Use cases son plain classes — instanciados via useFactory con inject explícito.
 *
 * Tarea: 3.E.2
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConfiguracionModule } from '../configuracion/configuracion.module';

// ─── Domain ports (tokens + interfaces) ──────────────────────────────────────
import { TICKET_REPOSITORY, ITicketRepository } from './domain/ports/i-ticket.repository';
import {
  OPERACION_TICKET_REPOSITORY,
  IOperacionTicketRepository,
} from './domain/ports/i-operacion-ticket.repository';
import { ARCHIVO_REPOSITORY, IArchivoRepository } from './domain/ports/i-archivo.repository';
import { ESTADO_REPOSITORY, IEstadoRepository } from './domain/ports/i-estado.repository';
import {
  USUARIO_TIPOS_TICKET_REPOSITORY,
  IUsuarioTiposTicketRepository,
} from './domain/ports/i-usuario-tipos-ticket.repository';
import {
  TIPO_TICKET_REPOSITORY,
  ITipoTicketRepository,
} from './domain/ports/i-tipo-ticket.repository';
import {
  TIPO_OPERACION_REPOSITORY,
  ITipoOperacionRepository,
} from './domain/ports/i-tipo-operacion.repository';
import {
  USUARIO_MASTER_CHECKER,
  IUsuarioMasterChecker,
} from './domain/ports/i-usuario-master.checker';
import { PRIORIDAD_REPOSITORY, IPrioridadRepository } from './domain/ports/i-prioridad.repository';
import {
  CICLO_CLIENTE_REPOSITORY,
  ICicloClienteRepository,
} from './domain/ports/i-ciclo-cliente.repository';
import { EMAIL_SENDER, EmailSenderPort } from './domain/ports/i-email-sender.port';
import {
  SOLICITANTE_EMAIL_RESOLVER,
  ISolicitanteEmailResolver,
} from './domain/ports/i-solicitante-email.resolver';
import { CONFIG_RESOLVER, IConfigResolver } from '../configuracion/domain/ports/i-config-resolver';
import {
  DOMAIN_EVENT_PUBLISHER,
  IDomainEventPublisher,
} from '../shared/domain/ports/i-domain-event-publisher';
import { LOGGER, ILogger } from '../shared/domain/ports/i-logger.port';

// ─── Infrastructure repositories ──────────────────────────────────────────────
import { PrismaTicketRepository } from './infrastructure/persistence/prisma/prisma-ticket.repository';
import { PrismaOperacionTicketRepository } from './infrastructure/persistence/prisma/prisma-operacion-ticket.repository';
import { PrismaArchivoRepository } from './infrastructure/persistence/prisma/prisma-archivo.repository';
import { PrismaEstadoRepository } from './infrastructure/persistence/prisma/prisma-estado.repository';
import { PrismaUsuarioTiposTicketRepository } from './infrastructure/persistence/prisma/prisma-usuario-tipos-ticket.repository';
import { PrismaTipoTicketRepository } from './infrastructure/persistence/prisma/prisma-tipo-ticket.repository';
import { PrismaTipoOperacionRepository } from './infrastructure/persistence/prisma/prisma-tipo-operacion.repository';
import { UsuarioMasterChecker } from './infrastructure/persistence/prisma/usuario-master.checker';
import { PrismaPrioridadRepository } from './infrastructure/persistence/prisma/prisma-prioridad.repository';
import { PrismaCicloClienteRepository } from './infrastructure/persistence/prisma/prisma-ciclo-cliente.repository';
import { SolicitanteEmailResolver } from './infrastructure/persistence/prisma/solicitante-email.resolver';
import { NodemailerEmailSender } from './infrastructure/email/nodemailer-email-sender.adapter';
import { NotificarCambioEstadoListener } from './infrastructure/events/notificar-cambio-estado.listener';

// ─── Domain services ──────────────────────────────────────────────────────────
import { NumeradorTicket } from './domain/services/numerador-ticket.service';
import {
  TicketStateMachineFactory,
  TICKET_STATE_MACHINE_FACTORY,
} from './domain/state-machine/ticket-state-machine.factory';

// ─── Shared tokens + interfaces ───────────────────────────────────────────────
import {
  TENANT_TRANSACTION_RUNNER,
  ITenantTransactionRunner,
} from '../shared/infrastructure/persistence/tenant-transaction-runner';
import { FILE_STORAGE, IFileStorage } from '../shared/domain/ports/i-file-storage';

// ─── Application services (colaboradores compartidos) ────────────────────────
import { ResolverCicloActivoParaCreacion } from './application/services/resolver-ciclo-activo.service';

// ─── Use cases ────────────────────────────────────────────────────────────────
import { CrearTicketUseCase } from './application/use-cases/crear-ticket.use-case';
import { ListarTicketsUseCase } from './application/use-cases/listar-tickets.use-case';
import { ObtenerTicketUseCase } from './application/use-cases/obtener-ticket.use-case';
import { TransicionarEstadoUseCase } from './application/use-cases/transicionar-estado.use-case';
import { AsignarTicketUseCase } from './application/use-cases/asignar-ticket.use-case';
import { AdjuntarArchivoUseCase } from './application/use-cases/adjuntar-archivo.use-case';
import { ListarOperacionesUseCase } from './application/use-cases/listar-operaciones.use-case';
import { EditarTicketUseCase } from './application/use-cases/editar-ticket.use-case';
import { EliminarTicketUseCase } from './application/use-cases/eliminar-ticket.use-case';
import { CrearObservacionUseCase } from './application/use-cases/crear-observacion.use-case';
import { CrearComentarioUseCase } from './application/use-cases/crear-comentario.use-case';
import { NotificarCambioEstadoHandler } from './application/event-handlers/notificar-cambio-estado.handler';

// ─── Guards ───────────────────────────────────────────────────────────────────
import { RolesGuard } from '../auth/infrastructure/guards/roles.guard';
import { PermissionsGuard } from '../auth/infrastructure/guards/permissions.guard';
import { TenantGuard } from '../auth/infrastructure/guards/tenant.guard';

// ─── Controllers ──────────────────────────────────────────────────────────────
import { TicketsController } from './interface/controllers/tickets.controller';
import { OperacionesController } from './interface/controllers/operaciones.controller';
import { ComentariosController } from './interface/controllers/comentarios.controller';

// ─── Module ───────────────────────────────────────────────────────────────────

@Module({
  imports: [
    // AuthModule exporta: TOKEN_SERVICE + JwtAuthGuard
    // Necesarios para que JwtAuthGuard (con @Inject(TOKEN_SERVICE)) sea resolvible
    // en el contexto de TicketsModule.
    AuthModule,
    // ConfiguracionModule exporta CONFIG_RESOLVER (PR6, runtime-config-table,
    // Dz12) — NotificarCambioEstadoHandler lo necesita para resolver la
    // SmtpConfig del tenant ANTES de enviar (design §7.2). NO @Global — import
    // explícito (nestjs-modules skill).
    ConfiguracionModule,
  ],
  controllers: [TicketsController, OperacionesController, ComentariosController],
  // Exportamos los providers que ComprasModule, ReparacionesModule y EquiposModule
  // necesitan para cablear sus propios use cases. El TICKET_STATE_MACHINE_FACTORY es
  // el singleton compartido que las máquinas de estado de cada dominio extienden via
  // factory.register() en onModuleInit de sus propios módulos.
  //
  // CICLO_CLIENTE_REPOSITORY + ResolverCicloActivoParaCreacion (Fase 4,
  // ciclos-master-tenant, ADR-1/ADR-4-Repo): se exportan para que compras/
  // reparaciones/equipos resuelvan el ciclo activo del tenant en sus propios
  // flujos de creación (PR2-5), sin depender del repo admin de `clientes`.
  exports: [
    TICKET_REPOSITORY,
    OPERACION_TICKET_REPOSITORY,
    ESTADO_REPOSITORY,
    TIPO_TICKET_REPOSITORY,
    TIPO_OPERACION_REPOSITORY,
    USUARIO_MASTER_CHECKER,
    NumeradorTicket,
    TICKET_STATE_MACHINE_FACTORY,
    CICLO_CLIENTE_REPOSITORY,
    ResolverCicloActivoParaCreacion,
  ],
  providers: [
    // ─── Repositorios tenant ─────────────────────────────────────────────────
    // Todos usan TenantContext (@Global) para obtener el PrismaClient del tenant.
    // NO re-declarar PrismaService aquí — viene del SharedModule @Global.
    {
      provide: TICKET_REPOSITORY,
      useClass: PrismaTicketRepository,
    },
    {
      provide: OPERACION_TICKET_REPOSITORY,
      useClass: PrismaOperacionTicketRepository,
    },
    {
      provide: ARCHIVO_REPOSITORY,
      useClass: PrismaArchivoRepository,
    },
    {
      provide: ESTADO_REPOSITORY,
      useClass: PrismaEstadoRepository,
    },
    {
      provide: USUARIO_TIPOS_TICKET_REPOSITORY,
      useClass: PrismaUsuarioTiposTicketRepository,
    },
    {
      provide: TIPO_TICKET_REPOSITORY,
      useClass: PrismaTipoTicketRepository,
    },
    {
      provide: TIPO_OPERACION_REPOSITORY,
      useClass: PrismaTipoOperacionRepository,
    },
    // UsuarioMasterChecker usa PrismaService (master) — NO TenantContext.
    // PrismaService es @Global desde SharedModule.
    {
      provide: USUARIO_MASTER_CHECKER,
      useClass: UsuarioMasterChecker,
    },
    {
      provide: PRIORIDAD_REPOSITORY,
      useClass: PrismaPrioridadRepository,
    },
    {
      provide: CICLO_CLIENTE_REPOSITORY,
      useClass: PrismaCicloClienteRepository,
    },

    // ─── Servicios de dominio ────────────────────────────────────────────────

    // TicketStateMachineFactory: sin @Injectable(), instanciada via useFactory.
    // Registra BaseTicketStateMachine como fallback interno.
    // Fases 4/5 (ComprasModule, ReparacionesModule) llaman factory.register()
    // en su propio wiring para los flujos COMPRAS y EDILICIA.
    {
      provide: TICKET_STATE_MACHINE_FACTORY,
      useFactory: (): TicketStateMachineFactory => new TicketStateMachineFactory(),
    },

    // NumeradorTicket depende solo de Pick<ITicketRepository, 'findLastSecuencia'>.
    {
      provide: NumeradorTicket,
      useFactory: (ticketRepo: ITicketRepository): NumeradorTicket =>
        new NumeradorTicket(ticketRepo),
      inject: [TICKET_REPOSITORY],
    },

    // ResolverCicloActivoParaCreacion (Fase 4, ADR-1): plain class, instanciada
    // via useFactory (mismo patrón que NumeradorTicket). Compras/Reparaciones/
    // Equipos la inyectan en sus propios use cases de creación (PR2-5) resolviendo
    // este provider exportado (o instanciando el suyo con el mismo repo importado
    // de TicketsModule).
    {
      provide: ResolverCicloActivoParaCreacion,
      useFactory: (cicloRepo: ICicloClienteRepository): ResolverCicloActivoParaCreacion =>
        new ResolverCicloActivoParaCreacion(cicloRepo),
      inject: [CICLO_CLIENTE_REPOSITORY],
    },

    // ─── Use cases (plain classes, instanciados via useFactory) ──────────────

    {
      provide: CrearTicketUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        operacionRepo: IOperacionTicketRepository,
        estadoRepo: IEstadoRepository,
        checker: IUsuarioMasterChecker,
        tipoTicketRepo: ITipoTicketRepository,
        tipoOpRepo: ITipoOperacionRepository,
        numerador: NumeradorTicket,
        resolverCicloActivo: ResolverCicloActivoParaCreacion,
        txRunner: ITenantTransactionRunner,
      ) =>
        new CrearTicketUseCase(
          ticketRepo,
          operacionRepo,
          estadoRepo,
          checker,
          tipoTicketRepo,
          tipoOpRepo,
          numerador,
          resolverCicloActivo,
          txRunner,
        ),
      inject: [
        TICKET_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        ESTADO_REPOSITORY,
        USUARIO_MASTER_CHECKER,
        TIPO_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        NumeradorTicket,
        ResolverCicloActivoParaCreacion,
        TENANT_TRANSACTION_RUNNER,
      ],
    },

    {
      provide: ObtenerTicketUseCase,
      useFactory: (ticketRepo: ITicketRepository): ObtenerTicketUseCase =>
        new ObtenerTicketUseCase(ticketRepo),
      inject: [TICKET_REPOSITORY],
    },

    // ListarTicketsUseCase (Fase 4, ADR-5): inyecta CICLO_CLIENTE_REPOSITORY
    // (tickets-side) para resolver el ciclo EFECTIVO por default (activo).
    {
      provide: ListarTicketsUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        cicloClienteRepo: ICicloClienteRepository,
      ): ListarTicketsUseCase => new ListarTicketsUseCase(ticketRepo, cicloClienteRepo),
      inject: [TICKET_REPOSITORY, CICLO_CLIENTE_REPOSITORY],
    },

    {
      provide: TransicionarEstadoUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        operacionRepo: IOperacionTicketRepository,
        estadoRepo: IEstadoRepository,
        tipoTicketRepo: ITipoTicketRepository,
        tipoOpRepo: ITipoOperacionRepository,
        factory: TicketStateMachineFactory,
        txRunner: ITenantTransactionRunner,
        publisher: IDomainEventPublisher,
        logger: ILogger,
      ) =>
        new TransicionarEstadoUseCase(
          ticketRepo,
          operacionRepo,
          estadoRepo,
          tipoTicketRepo,
          tipoOpRepo,
          factory,
          txRunner,
          publisher,
          logger,
        ),
      inject: [
        TICKET_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        ESTADO_REPOSITORY,
        TIPO_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        TICKET_STATE_MACHINE_FACTORY,
        TENANT_TRANSACTION_RUNNER,
        DOMAIN_EVENT_PUBLISHER,
        LOGGER,
      ],
    },

    {
      provide: AsignarTicketUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        operacionRepo: IOperacionTicketRepository,
        checker: IUsuarioMasterChecker,
        usuarioTiposRepo: IUsuarioTiposTicketRepository,
        tipoOpRepo: ITipoOperacionRepository,
        txRunner: ITenantTransactionRunner,
      ) =>
        new AsignarTicketUseCase(
          ticketRepo,
          operacionRepo,
          checker,
          usuarioTiposRepo,
          tipoOpRepo,
          txRunner,
        ),
      inject: [
        TICKET_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        USUARIO_MASTER_CHECKER,
        USUARIO_TIPOS_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        TENANT_TRANSACTION_RUNNER,
      ],
    },

    {
      provide: AdjuntarArchivoUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        archivoRepo: IArchivoRepository,
        fileStorage: IFileStorage,
        txRunner: ITenantTransactionRunner,
      ) => new AdjuntarArchivoUseCase(ticketRepo, archivoRepo, fileStorage, txRunner),
      inject: [TICKET_REPOSITORY, ARCHIVO_REPOSITORY, FILE_STORAGE, TENANT_TRANSACTION_RUNNER],
    },

    {
      provide: ListarOperacionesUseCase,
      // CRITICAL-2 fix: constructor now requires ITicketRepository to verify ticket existence.
      useFactory: (
        ticketRepo: ITicketRepository,
        operacionRepo: IOperacionTicketRepository,
      ): ListarOperacionesUseCase => new ListarOperacionesUseCase(ticketRepo, operacionRepo),
      inject: [TICKET_REPOSITORY, OPERACION_TICKET_REPOSITORY],
    },

    {
      provide: EditarTicketUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        estadoRepo: IEstadoRepository,
        prioridadRepo: IPrioridadRepository,
        cicloRepo: ICicloClienteRepository,
        operacionRepo: IOperacionTicketRepository,
        tipoOpRepo: ITipoOperacionRepository,
        txRunner: ITenantTransactionRunner,
      ) =>
        new EditarTicketUseCase(
          ticketRepo,
          estadoRepo,
          prioridadRepo,
          cicloRepo,
          operacionRepo,
          tipoOpRepo,
          txRunner,
        ),
      inject: [
        TICKET_REPOSITORY,
        ESTADO_REPOSITORY,
        PRIORIDAD_REPOSITORY,
        CICLO_CLIENTE_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        TENANT_TRANSACTION_RUNNER,
      ],
    },

    {
      provide: EliminarTicketUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        operacionRepo: IOperacionTicketRepository,
        tipoOpRepo: ITipoOperacionRepository,
        estadoRepo: IEstadoRepository,
        txRunner: ITenantTransactionRunner,
      ) => new EliminarTicketUseCase(ticketRepo, operacionRepo, tipoOpRepo, estadoRepo, txRunner),
      inject: [
        TICKET_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        ESTADO_REPOSITORY,
        TENANT_TRANSACTION_RUNNER,
      ],
    },

    {
      provide: CrearObservacionUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        estadoRepo: IEstadoRepository,
        operacionRepo: IOperacionTicketRepository,
        tipoOpRepo: ITipoOperacionRepository,
        txRunner: ITenantTransactionRunner,
        tipoTicketRepo: ITipoTicketRepository,
        publisher: IDomainEventPublisher,
        logger: ILogger,
      ) =>
        new CrearObservacionUseCase(
          ticketRepo,
          estadoRepo,
          operacionRepo,
          tipoOpRepo,
          txRunner,
          tipoTicketRepo,
          publisher,
          logger,
        ),
      inject: [
        TICKET_REPOSITORY,
        ESTADO_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        TENANT_TRANSACTION_RUNNER,
        TIPO_TICKET_REPOSITORY,
        DOMAIN_EVENT_PUBLISHER,
        LOGGER,
      ],
    },

    // CrearComentarioUseCase: sin ITenantTransactionRunner (un solo write — no necesita tx).
    // Deps: ticketRepo + estadoRepo + operacionRepo + tipoOperacionRepo.
    // Change: tickets-rbac-4-roles / PR4b — T4B.9
    {
      provide: CrearComentarioUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        estadoRepo: IEstadoRepository,
        operacionRepo: IOperacionTicketRepository,
        tipoOpRepo: ITipoOperacionRepository,
      ) => new CrearComentarioUseCase(ticketRepo, estadoRepo, operacionRepo, tipoOpRepo),
      inject: [
        TICKET_REPOSITORY,
        ESTADO_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
      ],
    },

    // ─── Guards ──────────────────────────────────────────────────────────────
    // JwtAuthGuard es exportado por AuthModule → no re-declarar aquí.
    // RolesGuard y PermissionsGuard dependen solo de Reflector (siempre disponible).
    // TenantGuard depende de PrismaService + TenantContext (@Global desde SharedModule).
    RolesGuard,
    PermissionsGuard,
    TenantGuard,

    // ─── Notificaciones por email al cambiar el estado (PR3, notif-email-estado-ticket) ──

    // SOLICITANTE_EMAIL_RESOLVER: usa PrismaService (master) — mismo patrón que
    // USUARIO_MASTER_CHECKER, SIN TenantContext (el listener async puede correr
    // fuera del ciclo request/response).
    {
      provide: SOLICITANTE_EMAIL_RESOLVER,
      useClass: SolicitanteEmailResolver,
    },

    // EMAIL_SENDER: adapter PURO — arma el transporter POR-ENVÍO a partir de
    // la SmtpConfig que le pasa el handler (Dz6/Dz11, PR6 runtime-config-table).
    // Ya NO lee `process.env` ni valida nada al bootstrap: el fail-fast de
    // config SMTP se corrió a send-time (R6).
    //
    // `useFactory` en vez de `useClass` (Judgment Day PR6 Ronda 1, item 4):
    // `useClass: NodemailerEmailSender` solo funcionaba porque la clase NO
    // tiene `@Injectable()` — Nest la construye sin args (`new
    // NodemailerEmailSender()`), lo que hace caer `transportFactory` a su
    // default. Frágil: si en el futuro alguien agrega `@Injectable()` a
    // `NodemailerEmailSender` (ej. para inyectarle algo), Nest intentaría
    // resolver el constructor por metadata de diseño y este wiring rompería
    // en silencio (sin error de compilación, solo en runtime del bootstrap).
    // `useFactory` no depende de esa ausencia de metadata.
    {
      provide: EMAIL_SENDER,
      useFactory: (): NodemailerEmailSender => new NodemailerEmailSender(),
    },

    // NotificarCambioEstadoHandler: plain class (application, sin decorators
    // NestJS) — instanciada via useFactory con los 3 ports (D2). CONFIG_RESOLVER
    // (PR6, Dz6) resuelve la SmtpConfig del tenant ANTES de emailSender.send().
    {
      provide: NotificarCambioEstadoHandler,
      useFactory: (
        configResolver: IConfigResolver,
        resolver: ISolicitanteEmailResolver,
        emailSender: EmailSenderPort,
      ): NotificarCambioEstadoHandler =>
        new NotificarCambioEstadoHandler(configResolver, resolver, emailSender),
      inject: [CONFIG_RESOLVER, SOLICITANTE_EMAIL_RESOLVER, EMAIL_SENDER],
    },

    // NotificarCambioEstadoListener: clase provider `@Injectable()`/`@OnEvent`
    // para que el `DiscoveryService` de @nestjs/event-emitter la detecte y
    // suscriba automáticamente al bootstrap (no requiere `exports`).
    NotificarCambioEstadoListener,
  ],
})
export class TicketsModule {}
