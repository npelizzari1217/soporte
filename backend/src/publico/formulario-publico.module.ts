import { Module } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService, getOptionsToken } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module';
import { EquiposModule } from '../equipos/equipos.module';
import { CrearTicketSoporteUseCase } from '../equipos/application/use-cases/crear-ticket-soporte.use-case';
import { TicketsModule } from '../tickets/tickets.module';
import {
  IPrioridadRepository,
  PRIORIDAD_REPOSITORY,
} from '../tickets/domain/ports/i-prioridad.repository';
import {
  ISolicitanteExternoRepository,
  SOLICITANTE_EXTERNO_REPOSITORY,
} from '../tickets/domain/ports/i-solicitante-externo.repository';
import {
  ITenantTransactionRunner,
  TENANT_TX_RUNNER,
} from '../shared/infrastructure/persistence/tenant-transaction-runner';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { CORREO_DE_CLIENTE, ICorreoDeCliente } from '../auth/domain/ports/i-correo-de-cliente.port';
import { CorreoDeClienteAdapter } from '../auth/infrastructure/email/correo-de-cliente.adapter';
import {
  CLIENTE_REPOSITORY,
  IClienteRepository,
} from '../clientes/domain/ports/i-cliente.repository';
import {
  CLIENTE_EMAIL_CONFIG_REPOSITORY,
  IClienteEmailConfigRepository,
} from '../clientes/domain/ports/i-cliente-email-config.repository';
import { PrismaClienteEmailConfigRepository } from '../clientes/infrastructure/persistence/prisma/prisma-cliente-email-config.repository';
import {
  EQUIPO_INFORMATICO_REPOSITORY,
  IEquipoInformaticoRepository,
} from '../equipos/domain/ports/i-equipo-informatico.repository';
import { entorno } from '../config/entorno';
import { ILogger, LOGGER } from '../shared/domain/ports/i-logger.port';
import {
  ITareasSegundoPlano,
  TAREAS_SEGUNDO_PLANO,
} from '../shared/domain/ports/i-tareas-segundo-plano.port';
import { TareasSegundoPlano } from '../shared/infrastructure/segundo-plano/tareas-segundo-plano';
import { EMAIL_SENDER, IEmailSender } from '../shared/domain/ports/i-email-sender';
import { PrismaService } from '../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../shared/tenancy/tenant-context';
import { ITenantEnumerator, TENANT_ENUMERATOR } from '../shared/domain/ports/i-tenant-enumerator';
import { ResolverClientePublicoService } from './application/services/resolver-cliente-publico.service';
import {
  IPedidoPendienteRepository,
  PEDIDO_PENDIENTE_REPOSITORY,
} from './domain/ports/i-pedido-pendiente.repository';
import {
  IPedidoPublicoTokenRepository,
  PEDIDO_PUBLICO_TOKEN_REPOSITORY,
} from './domain/ports/i-pedido-publico-token.repository';
import { PrismaPedidoPendienteRepository } from './infrastructure/persistence/prisma/prisma-pedido-pendiente.repository';
import { PrismaPedidoPublicoTokenRepository } from './infrastructure/persistence/prisma/prisma-pedido-publico-token.repository';
import { ConfirmarPedidoPublicoUseCase } from './application/use-cases/confirmar-pedido-publico.use-case';
import { NotificarPedidoCreadoService } from './application/services/notificar-pedido-creado.service';
import { SolicitarPedidoPublicoUseCase } from './application/use-cases/solicitar-pedido-publico.use-case';
import { ConsultarContextoPedidoUseCase } from './application/use-cases/consultar-contexto-pedido.use-case';
import {
  CLIENTE_THROTTLE_LIMIT,
  CONFIRMACION_THROTTLE_LIMIT,
  CONFIRMACION_THROTTLE_TTL_MS,
  CLIENTE_THROTTLE_TTL_MS,
  CONTEXTO_THROTTLE_LIMIT,
  CONTEXTO_THROTTLE_TTL_MS,
  EMAIL_THROTTLE_LIMIT,
  EMAIL_THROTTLE_TTL_MS,
  PedidoPublicoThrottlerGuard,
  trackerCliente,
  trackerConfirmacion,
  trackerEmail,
} from './infrastructure/guards/pedido-publico-throttler.guard';
import { PurgaPendientesVencidosScheduler } from './infrastructure/schedulers/purga-pendientes-vencidos.scheduler';
import { PedidoPublicoController } from './interface/controllers/pedido-publico.controller';

/**
 * FormularioPublicoModule — rutas públicas del formulario de pedido por QR
 * (sdd/formulario-publico-qr).
 *
 * NO está registrado en `AppModule` todavía: las rutas no se exponen hasta el cierre del ciclo,
 * cuando el formulario está completo. Los e2e lo importan directo.
 *
 * Wiring:
 * - `AuthModule` por `CLIENTE_REPOSITORY`; `EquiposModule` por `EQUIPO_INFORMATICO_REPOSITORY`;
 *   `NotificacionesModule` por `EMAIL_SENDER`.
 * - `TAREAS_SEGUNDO_PLANO` es LOCAL (como en `RecuperacionPasswordModule`): difiere el mail de la
 *   solicitud para que no condicione la respuesta.
 * - `CORREO_DE_CLIENTE` y su `CLIENTE_EMAIL_CONFIG_REPOSITORY` son LOCALES, igual que en
 *   `RecuperacionPasswordModule`: el adaptador solo lee estado, así que dos instancias son
 *   inofensivas.
 * - `PurgaPendientesVencidosScheduler` (WU-20, W2): barrido horario que borra los pendientes
 *   vencidos de cada tenant activo. `TENANT_ENUMERATOR` viene de `SharedModule` (`@Global()`) y
 *   `ScheduleModule.forRoot()` de `AppModule`.
 * - Throttler: opciones con nombre y `ThrottlerStorage` locales (no hay `forRoot` ni `APP_GUARD`).
 *   El guard se aplica por `@UseGuards` en el controller. El storage es memoria de un proceso.
 *
 * Ref design: ADR-8, ADR-9. Tarea: 12.3, 13.3, 15.2.
 */
@Module({
  imports: [AuthModule, EquiposModule, NotificacionesModule, TicketsModule],
  controllers: [PedidoPublicoController],
  providers: [
    {
      provide: getOptionsToken(),
      useValue: [
        { name: 'contexto', limit: CONTEXTO_THROTTLE_LIMIT, ttl: CONTEXTO_THROTTLE_TTL_MS },
        {
          name: 'email',
          limit: EMAIL_THROTTLE_LIMIT,
          ttl: EMAIL_THROTTLE_TTL_MS,
          getTracker: trackerEmail,
        },
        {
          name: 'cliente',
          limit: CLIENTE_THROTTLE_LIMIT,
          ttl: CLIENTE_THROTTLE_TTL_MS,
          getTracker: trackerCliente,
        },
        {
          name: 'confirmacion',
          limit: CONFIRMACION_THROTTLE_LIMIT,
          ttl: CONFIRMACION_THROTTLE_TTL_MS,
          getTracker: trackerConfirmacion,
        },
      ],
    },
    { provide: ThrottlerStorage, useClass: ThrottlerStorageService },
    PedidoPublicoThrottlerGuard,

    {
      provide: TAREAS_SEGUNDO_PLANO,
      useFactory: (logger: ILogger) => new TareasSegundoPlano(logger),
      inject: [LOGGER],
    },
    { provide: PEDIDO_PENDIENTE_REPOSITORY, useClass: PrismaPedidoPendienteRepository },
    { provide: PEDIDO_PUBLICO_TOKEN_REPOSITORY, useClass: PrismaPedidoPublicoTokenRepository },

    { provide: CLIENTE_EMAIL_CONFIG_REPOSITORY, useClass: PrismaClienteEmailConfigRepository },
    {
      provide: CORREO_DE_CLIENTE,
      useFactory: (
        clienteRepo: IClienteRepository,
        emailConfigRepo: IClienteEmailConfigRepository,
        prismaService: PrismaService,
        tenantContext: TenantContext,
        emailSender: IEmailSender,
      ) =>
        new CorreoDeClienteAdapter(
          clienteRepo,
          emailConfigRepo,
          prismaService,
          tenantContext,
          emailSender,
        ),
      inject: [
        CLIENTE_REPOSITORY,
        CLIENTE_EMAIL_CONFIG_REPOSITORY,
        PrismaService,
        TenantContext,
        EMAIL_SENDER,
      ],
    },

    {
      provide: ResolverClientePublicoService,
      useFactory: (
        clienteRepo: IClienteRepository,
        prismaService: PrismaService,
        tenantContext: TenantContext,
      ) => new ResolverClientePublicoService(clienteRepo, prismaService, tenantContext),
      inject: [CLIENTE_REPOSITORY, PrismaService, TenantContext],
    },
    {
      provide: ConsultarContextoPedidoUseCase,
      useFactory: (
        resolver: ResolverClientePublicoService,
        correoDeCliente: ICorreoDeCliente,
        equipoRepo: IEquipoInformaticoRepository,
      ) => new ConsultarContextoPedidoUseCase(resolver, correoDeCliente, equipoRepo),
      inject: [ResolverClientePublicoService, CORREO_DE_CLIENTE, EQUIPO_INFORMATICO_REPOSITORY],
    },
    {
      provide: SolicitarPedidoPublicoUseCase,
      useFactory: (
        resolver: ResolverClientePublicoService,
        correoDeCliente: ICorreoDeCliente,
        equipoRepo: IEquipoInformaticoRepository,
        pendienteRepo: IPedidoPendienteRepository,
        tokenRepo: IPedidoPublicoTokenRepository,
        tareas: ITareasSegundoPlano,
      ) =>
        new SolicitarPedidoPublicoUseCase(
          resolver,
          correoDeCliente,
          equipoRepo,
          pendienteRepo,
          tokenRepo,
          tareas,
          // Nunca el header `Host` (ADR-7): el link sale de la configuración.
          entorno.APP_BASE_URL,
        ),
      inject: [
        ResolverClientePublicoService,
        CORREO_DE_CLIENTE,
        EQUIPO_INFORMATICO_REPOSITORY,
        PEDIDO_PENDIENTE_REPOSITORY,
        PEDIDO_PUBLICO_TOKEN_REPOSITORY,
        TAREAS_SEGUNDO_PLANO,
      ],
    },
    {
      provide: ConfirmarPedidoPublicoUseCase,
      useFactory: (
        resolver: ResolverClientePublicoService,
        correoDeCliente: ICorreoDeCliente,
        tokenRepo: IPedidoPublicoTokenRepository,
        pendienteRepo: IPedidoPendienteRepository,
        solicitanteRepo: ISolicitanteExternoRepository,
        prioridadRepo: IPrioridadRepository,
        crearTicketSoporte: CrearTicketSoporteUseCase,
        txRunner: ITenantTransactionRunner,
        logger: ILogger,
      ) =>
        new ConfirmarPedidoPublicoUseCase(
          resolver,
          correoDeCliente,
          tokenRepo,
          pendienteRepo,
          solicitanteRepo,
          prioridadRepo,
          crearTicketSoporte,
          txRunner,
          logger,
        ),
      inject: [
        ResolverClientePublicoService,
        CORREO_DE_CLIENTE,
        PEDIDO_PUBLICO_TOKEN_REPOSITORY,
        PEDIDO_PENDIENTE_REPOSITORY,
        SOLICITANTE_EXTERNO_REPOSITORY,
        PRIORIDAD_REPOSITORY,
        CrearTicketSoporteUseCase,
        TENANT_TX_RUNNER,
        LOGGER,
      ],
    },
    {
      provide: NotificarPedidoCreadoService,
      useFactory: (correoDeCliente: ICorreoDeCliente, tareas: ITareasSegundoPlano) =>
        new NotificarPedidoCreadoService(correoDeCliente, tareas),
      inject: [CORREO_DE_CLIENTE, TAREAS_SEGUNDO_PLANO],
    },
    {
      provide: PurgaPendientesVencidosScheduler,
      useFactory: (
        tenantEnumerator: ITenantEnumerator,
        tenantContext: TenantContext,
        prismaService: PrismaService,
        pendienteRepo: IPedidoPendienteRepository,
        logger: ILogger,
      ) =>
        new PurgaPendientesVencidosScheduler(
          tenantEnumerator,
          tenantContext,
          prismaService,
          pendienteRepo,
          logger,
        ),
      inject: [
        TENANT_ENUMERATOR,
        TenantContext,
        PrismaService,
        PEDIDO_PENDIENTE_REPOSITORY,
        LOGGER,
      ],
    },
  ],
})
export class FormularioPublicoModule {}
