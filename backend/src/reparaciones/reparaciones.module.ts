import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TicketsModule } from '../tickets/tickets.module';

import { TICKET_REPOSITORY, ITicketRepository } from '../tickets/domain/ports/i-ticket.repository';
import {
  OPERACION_TICKET_REPOSITORY,
  IOperacionTicketRepository,
} from '../tickets/domain/ports/i-operacion-ticket.repository';
import { ESTADO_REPOSITORY, IEstadoRepository } from '../tickets/domain/ports/i-estado.repository';
import {
  TIPO_TICKET_REPOSITORY,
  ITipoTicketRepository,
} from '../tickets/domain/ports/i-tipo-ticket.repository';
import {
  TIPO_OPERACION_REPOSITORY,
  ITipoOperacionRepository,
} from '../tickets/domain/ports/i-tipo-operacion.repository';
import {
  USUARIO_MASTER_CHECKER,
  IUsuarioMasterChecker,
} from '../tickets/domain/ports/i-usuario-master.checker';
import {
  CICLO_CLIENTE_REPOSITORY,
  ICicloClienteRepository,
} from '../tickets/domain/ports/i-ciclo-cliente.repository';
import { NumeradorTicket } from '../tickets/domain/services/numerador-ticket.service';
import { ResolverCicloActivoParaCreacion } from '../tickets/application/services/resolver-ciclo-activo.service';
import {
  ITenantTransactionRunner,
  TENANT_TX_RUNNER,
} from '../shared/infrastructure/persistence/tenant-transaction-runner';

import {
  TICKET_EDILICIA_REPOSITORY,
  ITicketEdiliciaRepository,
} from './domain/ports/i-ticket-edilicia.repository';
import { PrismaTicketEdiliciaRepository } from './infrastructure/persistence/prisma/prisma-ticket-edilicia.repository';
import {
  SUBTAREA_EDILICIA_REPOSITORY,
  ISubtareaEdiliciaRepository,
} from './domain/ports/i-subtarea-edilicia.repository';
import { PrismaSubtareaEdiliciaRepository } from './infrastructure/persistence/prisma/prisma-subtarea-edilicia.repository';

import { CrearTicketEdilicioUseCase } from './application/use-cases/crear-ticket-edilicio.use-case';
import { ListarReparacionesUseCase } from './application/use-cases/listar-reparaciones.use-case';
import { CrearSubtareaUseCase } from './application/use-cases/crear-subtarea.use-case';
import { CompletarSubtareaUseCase } from './application/use-cases/completar-subtarea.use-case';
import { EliminarSubtareaUseCase } from './application/use-cases/eliminar-subtarea.use-case';

import { ReparacionesController } from './interface/controllers/reparaciones.controller';

/**
 * ReparacionesModule — módulo NestJS del dominio "reparaciones" (Fase 3,
 * F3-E1..E5).
 *
 * Flujo de reparaciones edilicias: ticket_edilicia (satélite 1:0..1 de
 * Ticket, con `ubicacion` como texto libre — ex-catálogo Ubicacion
 * removido), subtareas_edilicia (checklist de avance, `AvanceCalculator`).
 *
 * Wiring (PR6-PR9, screaming module hexagonal — domain/ → application/ →
 * infrastructure/ → interface/):
 * - Importa `TicketsModule` para reusar sus providers EXPORTADOS
 *   (TICKET_REPOSITORY, OPERACION_TICKET_REPOSITORY, ESTADO_REPOSITORY,
 *   TIPO_TICKET_REPOSITORY, TIPO_OPERACION_REPOSITORY,
 *   USUARIO_MASTER_CHECKER, CICLO_CLIENTE_REPOSITORY) — NO se
 *   reimplementan, se inyectan por token (mismo patrón que `ComprasModule`).
 * - `NumeradorTicket`/`ResolverCicloActivoParaCreacion` son clases planas
 *   (sin `@Injectable`) — se resuelven vía `useFactory` inyectando sus
 *   puertos por token, igual que en `ComprasModule`.
 * - `TENANT_TX_RUNNER` se inyecta desde `SharedModule` (`@Global`, sin
 *   necesidad de reimportarlo).
 * - `ReparacionesController` expone `POST/GET /reparaciones` + subtareas.
 *
 * FITNESS RULE: PrismaService y @prisma/client solo pueden importarse desde
 * infrastructure/ (ver backend/eslint.config.js).
 */
@Module({
  // AuthModule: ver comentario equivalente en compras.module.ts (mismo gap,
  // descubierto por sdd/beta-frontend B6, T6.2) — TicketsModule NO
  // re-exporta AuthModule, así que los guards de ReparacionesController lo
  // necesitan importado acá explícitamente.
  imports: [AuthModule, TicketsModule],
  controllers: [ReparacionesController],
  providers: [
    { provide: TICKET_EDILICIA_REPOSITORY, useClass: PrismaTicketEdiliciaRepository },
    { provide: SUBTAREA_EDILICIA_REPOSITORY, useClass: PrismaSubtareaEdiliciaRepository },

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
      provide: CrearTicketEdilicioUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        operacionRepo: IOperacionTicketRepository,
        ticketEdiliciaRepo: ITicketEdiliciaRepository,
        estadoRepo: IEstadoRepository,
        tipoTicketRepo: ITipoTicketRepository,
        tipoOperacionRepo: ITipoOperacionRepository,
        usuarioMasterChecker: IUsuarioMasterChecker,
        numerador: NumeradorTicket,
        resolverCicloActivo: ResolverCicloActivoParaCreacion,
        txRunner: ITenantTransactionRunner,
      ) =>
        new CrearTicketEdilicioUseCase(
          ticketRepo,
          operacionRepo,
          ticketEdiliciaRepo,
          estadoRepo,
          tipoTicketRepo,
          tipoOperacionRepo,
          usuarioMasterChecker,
          numerador,
          resolverCicloActivo,
          txRunner,
        ),
      inject: [
        TICKET_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        TICKET_EDILICIA_REPOSITORY,
        ESTADO_REPOSITORY,
        TIPO_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        USUARIO_MASTER_CHECKER,
        NumeradorTicket,
        ResolverCicloActivoParaCreacion,
        TENANT_TX_RUNNER,
      ],
    },
    {
      provide: ListarReparacionesUseCase,
      useFactory: (
        ediliciaRepo: ITicketEdiliciaRepository,
        ticketRepo: ITicketRepository,
        subtareaRepo: ISubtareaEdiliciaRepository,
      ) => new ListarReparacionesUseCase(ediliciaRepo, ticketRepo, subtareaRepo),
      inject: [TICKET_EDILICIA_REPOSITORY, TICKET_REPOSITORY, SUBTAREA_EDILICIA_REPOSITORY],
    },
    {
      provide: CrearSubtareaUseCase,
      useFactory: (
        ticketEdiliciaRepo: ITicketEdiliciaRepository,
        subtareaRepo: ISubtareaEdiliciaRepository,
        operacionRepo: IOperacionTicketRepository,
        tipoOperacionRepo: ITipoOperacionRepository,
        txRunner: ITenantTransactionRunner,
      ) =>
        new CrearSubtareaUseCase(
          ticketEdiliciaRepo,
          subtareaRepo,
          operacionRepo,
          tipoOperacionRepo,
          txRunner,
        ),
      inject: [
        TICKET_EDILICIA_REPOSITORY,
        SUBTAREA_EDILICIA_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        TENANT_TX_RUNNER,
      ],
    },
    {
      provide: CompletarSubtareaUseCase,
      useFactory: (
        subtareaRepo: ISubtareaEdiliciaRepository,
        ticketEdiliciaRepo: ITicketEdiliciaRepository,
        operacionRepo: IOperacionTicketRepository,
        tipoOperacionRepo: ITipoOperacionRepository,
        txRunner: ITenantTransactionRunner,
      ) =>
        new CompletarSubtareaUseCase(
          subtareaRepo,
          ticketEdiliciaRepo,
          operacionRepo,
          tipoOperacionRepo,
          txRunner,
        ),
      inject: [
        SUBTAREA_EDILICIA_REPOSITORY,
        TICKET_EDILICIA_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        TENANT_TX_RUNNER,
      ],
    },
    {
      provide: EliminarSubtareaUseCase,
      useFactory: (
        subtareaRepo: ISubtareaEdiliciaRepository,
        ticketEdiliciaRepo: ITicketEdiliciaRepository,
        operacionRepo: IOperacionTicketRepository,
        tipoOperacionRepo: ITipoOperacionRepository,
        txRunner: ITenantTransactionRunner,
      ) =>
        new EliminarSubtareaUseCase(
          subtareaRepo,
          ticketEdiliciaRepo,
          operacionRepo,
          tipoOperacionRepo,
          txRunner,
        ),
      inject: [
        SUBTAREA_EDILICIA_REPOSITORY,
        TICKET_EDILICIA_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        TENANT_TX_RUNNER,
      ],
    },
  ],
  exports: [TICKET_EDILICIA_REPOSITORY, SUBTAREA_EDILICIA_REPOSITORY],
})
export class ReparacionesModule {}
