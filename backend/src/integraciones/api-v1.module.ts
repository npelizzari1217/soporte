import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module';
import { ListarTicketsUseCase } from '../tickets/application/use-cases/listar-tickets.use-case';
import {
  CICLO_CLIENTE_REPOSITORY,
  ICicloClienteRepository,
} from '../tickets/domain/ports/i-ciclo-cliente.repository';
import { ITicketRepository, TICKET_REPOSITORY } from '../tickets/domain/ports/i-ticket.repository';
import {
  ITipoTicketRepository,
  TIPO_TICKET_REPOSITORY,
} from '../tickets/domain/ports/i-tipo-ticket.repository';
import { TicketsModule } from '../tickets/tickets.module';
import { ApiClaveGuard } from './infrastructure/api-clave.guard';
import {
  API_V1_VENTANA_MS,
  ApiV1ThrottlerGuard,
  limiteApiV1,
} from './infrastructure/api-v1-throttler.guard';
import { IntegracionesModule } from './integraciones.module';
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
  controllers: [TicketsV1Controller],
  providers: [
    ApiClaveGuard,
    ApiV1ThrottlerGuard,
    TicketsV1Presenter,
    // TicketsModule no exporta este caso de uso: se arma con los mismos repositorios que exporta.
    {
      provide: ListarTicketsUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        cicloRepo: ICicloClienteRepository,
        tipoTicketRepo: ITipoTicketRepository,
      ) => new ListarTicketsUseCase(ticketRepo, cicloRepo, tipoTicketRepo),
      inject: [TICKET_REPOSITORY, CICLO_CLIENTE_REPOSITORY, TIPO_TICKET_REPOSITORY],
    },
  ],
  exports: [ApiClaveGuard, ApiV1ThrottlerGuard, ThrottlerModule, IntegracionesModule],
})
export class ApiV1Module {}
