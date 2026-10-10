import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module';
import { CrearComentarioUseCase } from '../tickets/application/use-cases/crear-comentario.use-case';
import { ListarEstadosUseCase } from '../tickets/application/use-cases/listar-estados.use-case';
import { ListarPrioridadesUseCase } from '../tickets/application/use-cases/listar-prioridades.use-case';
import { ListarTicketsUseCase } from '../tickets/application/use-cases/listar-tickets.use-case';
import { ListarTiposTicketUseCase } from '../tickets/application/use-cases/listar-tipos-ticket.use-case';
import {
  CICLO_CLIENTE_REPOSITORY,
  ICicloClienteRepository,
} from '../tickets/domain/ports/i-ciclo-cliente.repository';
import { ESTADO_REPOSITORY, IEstadoRepository } from '../tickets/domain/ports/i-estado.repository';
import {
  IOperacionTicketRepository,
  OPERACION_TICKET_REPOSITORY,
} from '../tickets/domain/ports/i-operacion-ticket.repository';
import {
  IPrimeraRespuestaWriteRepository,
  PRIMERA_RESPUESTA_WRITE_REPOSITORY,
} from '../tickets/domain/ports/i-primera-respuesta-write.repository';
import {
  IPrioridadRepository,
  PRIORIDAD_REPOSITORY,
} from '../tickets/domain/ports/i-prioridad.repository';
import { ITicketRepository, TICKET_REPOSITORY } from '../tickets/domain/ports/i-ticket.repository';
import {
  ITipoTicketRepository,
  TIPO_TICKET_REPOSITORY,
} from '../tickets/domain/ports/i-tipo-ticket.repository';
import {
  ITipoOperacionRepository,
  TIPO_OPERACION_REPOSITORY,
} from '../tickets/domain/ports/i-tipo-operacion.repository';
import { TicketsModule } from '../tickets/tickets.module';
import { ApiClaveGuard } from './infrastructure/api-clave.guard';
import {
  API_V1_VENTANA_MS,
  ApiV1ThrottlerGuard,
  limiteApiV1,
} from './infrastructure/api-v1-throttler.guard';
import {
  DOMAIN_EVENT_PUBLISHER,
  IDomainEventPublisher,
} from '../shared/domain/ports/i-domain-event-publisher';
import {
  ITenantTransactionRunner,
  TENANT_TX_RUNNER,
} from '../shared/infrastructure/persistence/tenant-transaction-runner';
import { IntegracionesModule } from './integraciones.module';
import { CatalogosV1Controller } from './interface/catalogos-v1.controller';
import { TicketsV1Controller } from './interface/tickets-v1.controller';
import { TicketsV1Presenter } from './interface/tickets-v1.presenter';

/**
 * ApiV1Module — host de los controllers de la API publica `v1` (sdd/api-publica, T4).
 *
 * Provee los guards de clave y de limite por clave. Los controllers `v1` se declaran aca y
 * usan `@ApiV1()`. El limite se lee al compilar el modulo (`API_V1_RATE_LIMIT`, 60 por defecto),
 * con storage propio en memoria, independiente del de CSAT.
 */
@Module({
  imports: [
    AuthModule,
    IntegracionesModule,
    TicketsModule,
    ThrottlerModule.forRootAsync({
      useFactory: () => [{ limit: limiteApiV1(), ttl: API_V1_VENTANA_MS }],
    }),
  ],
  controllers: [TicketsV1Controller, CatalogosV1Controller],
  providers: [
    ApiClaveGuard,
    ApiV1ThrottlerGuard,
    TicketsV1Presenter,
    // TicketsModule no exporta estos casos de uso: se arman con los mismos repositorios que exporta.
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
      provide: CrearComentarioUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        operacionRepo: IOperacionTicketRepository,
        estadoRepo: IEstadoRepository,
        tipoOperacionRepo: ITipoOperacionRepository,
        eventPublisher: IDomainEventPublisher,
        txRunner: ITenantTransactionRunner,
        primeraRespuestaRepo: IPrimeraRespuestaWriteRepository,
      ) =>
        new CrearComentarioUseCase(
          ticketRepo,
          operacionRepo,
          estadoRepo,
          tipoOperacionRepo,
          eventPublisher,
          txRunner,
          primeraRespuestaRepo,
        ),
      inject: [
        TICKET_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        ESTADO_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        DOMAIN_EVENT_PUBLISHER,
        TENANT_TX_RUNNER,
        PRIMERA_RESPUESTA_WRITE_REPOSITORY,
      ],
    },
    // Catalogos de `GET /v1/catalogos` (T5c): mismos casos de uso que la API interna.
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
  ],
  exports: [ApiClaveGuard, ApiV1ThrottlerGuard, ThrottlerModule, IntegracionesModule],
})
export class ApiV1Module {}
