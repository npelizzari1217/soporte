import { Module } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService, getOptionsToken } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module';
import { ListarTiposTicketUseCase } from '../tickets/application/use-cases/listar-tipos-ticket.use-case';
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
import { TicketsV1Query } from './application/tickets-v1.query';
import { TiposTicketV1Query } from './application/tipos-ticket-v1.query';
import { IntegracionesModule } from './integraciones.module';
import { CatalogosV1Controller } from './interface/catalogos-v1.controller';
import { TicketsV1Controller } from './interface/tickets-v1.controller';
import { TicketsV1Presenter } from './interface/tickets-v1.presenter';

/**
 * ApiV1Module — host de los controllers de la API publica `v1` (sdd/api-publica, T4).
 *
 * Provee los guards de clave y de limite por clave. Los controllers `v1` se declaran aca y
 * usan `@ApiV1()`. El limite se lee al instanciar el modulo (`API_V1_RATE_LIMIT`, 60 por defecto),
 * con storage propio en memoria, independiente del de CSAT.
 *
 * Throttler: opciones y `ThrottlerStorage` LOCALES, sin `ThrottlerModule.forRoot*` (JD-6, misma
 * convencion que `RecuperacionPasswordModule` y `FormularioPublicoModule`): `ThrottlerModule` es
 * `@Global()` y `CsatModule` ya lo registra. Se exportan junto con el guard para que un modulo que
 * importe este y declare su propio controller `@ApiV1()` use las mismas opciones y el mismo
 * storage, es decir, el mismo cupo por clave.
 */
@Module({
  imports: [AuthModule, IntegracionesModule, TicketsModule],
  controllers: [TicketsV1Controller, CatalogosV1Controller],
  providers: [
    {
      provide: getOptionsToken(),
      useFactory: () => [{ limit: limiteApiV1(), ttl: API_V1_VENTANA_MS }],
    },
    { provide: ThrottlerStorage, useClass: ThrottlerStorageService },
    ApiClaveGuard,
    ApiV1ThrottlerGuard,
    TicketsV1Presenter,
    // Los casos de uso de tickets (listar, comentar y los catalogos de `GET /v1/catalogos`) los
    // exporta TicketsModule. Fuente unica de los tipos `v1`: la lista el catalogo y la valida el
    // alta (T5e).
    {
      provide: TiposTicketV1Query,
      useFactory: (listarTipos: ListarTiposTicketUseCase) => new TiposTicketV1Query(listarTipos),
      inject: [ListarTiposTicketUseCase],
    },
    // Gate de modulo de ver, comentar y la referencia del alta (solo tickets del modulo TICKETS).
    {
      provide: TicketsV1Query,
      useFactory: (ticketRepo: ITicketRepository, tipoTicketRepo: ITipoTicketRepository) =>
        new TicketsV1Query(ticketRepo, tipoTicketRepo),
      inject: [TICKET_REPOSITORY, TIPO_TICKET_REPOSITORY],
    },
  ],
  exports: [
    ApiClaveGuard,
    ApiV1ThrottlerGuard,
    getOptionsToken(),
    ThrottlerStorage,
    IntegracionesModule,
  ],
})
export class ApiV1Module {}
