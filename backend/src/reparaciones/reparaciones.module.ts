import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TicketsModule } from '../tickets/tickets.module';
import { ComprasModule } from '../compras/compras.module';

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
  IDomainEventPublisher,
  DOMAIN_EVENT_PUBLISHER,
} from '../shared/domain/ports/i-domain-event-publisher';
import { COMPRA_REPOSITORY, ICompraRepository } from '../compras/domain/ports/i-compra.repository';

import {
  TICKET_EDILICIA_REPOSITORY,
  ITicketEdiliciaRepository,
} from './domain/ports/i-ticket-edilicia.repository';
import { PrismaTicketEdiliciaRepository } from './infrastructure/persistence/prisma/prisma-ticket-edilicia.repository';
import { SUBTAREA_EDILICIA_REPOSITORY } from './domain/ports/i-subtarea-edilicia.repository';
import { PrismaSubtareaEdiliciaRepository } from './infrastructure/persistence/prisma/prisma-subtarea-edilicia.repository';
import {
  COMENTARIO_REPARACION_REPOSITORY,
  IComentarioReparacionRepository,
} from './domain/ports/i-comentario-reparacion.repository';
import { PrismaComentarioReparacionRepository } from './infrastructure/persistence/prisma/prisma-comentario-reparacion.repository';
import {
  REPARACION_COMPRA_REPOSITORY,
  IReparacionCompraRepository,
} from './domain/ports/i-reparacion-compra.repository';
import { PrismaReparacionCompraRepository } from './infrastructure/persistence/prisma/prisma-reparacion-compra.repository';

import { ResolverAsignacionAutomatica } from '../tickets/application/services/resolver-asignacion-automatica.service';
import { CrearTicketEdilicioUseCase } from './application/use-cases/crear-ticket-edilicio.use-case';
import { ListarReparacionesUseCase } from './application/use-cases/listar-reparaciones.use-case';
import {
  CompletarSubtareaSobreTareaUseCase,
  CrearSubtareaSobreTareaUseCase,
  EliminarSubtareaSobreTareaUseCase,
} from './application/use-cases/subtareas-sobre-tareas.use-cases';
import {
  ITareaTicketRepository,
  TAREA_TICKET_REPOSITORY,
} from '../tickets/domain/ports/i-tarea-ticket.repository';
import { CrearTareaTicketUseCase } from '../tickets/application/use-cases/crear-tarea-ticket.use-case';
import { CompletarTareaUseCase } from '../tickets/application/use-cases/completar-tarea.use-case';
import { EliminarTareaUseCase } from '../tickets/application/use-cases/eliminar-tarea.use-case';
import { CrearComentarioReparacionUseCase } from './application/use-cases/crear-comentario-reparacion.use-case';
import { ListarComentariosReparacionUseCase } from './application/use-cases/listar-comentarios-reparacion.use-case';
import { ExportarReparacionesUseCase } from './application/use-cases/exportar-reparaciones.use-case';
import { VincularCompraAReparacionUseCase } from './application/use-cases/vincular-compra-a-reparacion.use-case';
import { DesvincularCompraDeReparacionUseCase } from './application/use-cases/desvincular-compra-de-reparacion.use-case';

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
 * - `ComprasModule` (WU5, sdd/reparacion-bloqueada-por-compra, D7): se
 *   importa SOLO para reusar `COMPRA_REPOSITORY` (ya exportado por
 *   `ComprasModule`) en `VincularCompraAReparacionUseCase` — cero cambio de
 *   firma en el puerto de compras, mismo patrón que `TicketsModule` de
 *   arriba.
 *
 * FITNESS RULE: PrismaService y @prisma/client solo pueden importarse desde
 * infrastructure/ (ver backend/eslint.config.js).
 */
@Module({
  // AuthModule: ver comentario equivalente en compras.module.ts (mismo gap,
  // descubierto por sdd/beta-frontend B6, T6.2) — TicketsModule NO
  // re-exporta AuthModule, así que los guards de ReparacionesController lo
  // necesitan importado acá explícitamente.
  imports: [AuthModule, TicketsModule, ComprasModule],
  controllers: [ReparacionesController],
  providers: [
    { provide: TICKET_EDILICIA_REPOSITORY, useClass: PrismaTicketEdiliciaRepository },
    { provide: SUBTAREA_EDILICIA_REPOSITORY, useClass: PrismaSubtareaEdiliciaRepository },
    { provide: COMENTARIO_REPARACION_REPOSITORY, useClass: PrismaComentarioReparacionRepository },
    { provide: REPARACION_COMPRA_REPOSITORY, useClass: PrismaReparacionCompraRepository },

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
        resolverAsignacion: ResolverAsignacionAutomatica,
        eventPublisher: IDomainEventPublisher,
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
          resolverAsignacion,
          eventPublisher,
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
        ResolverAsignacionAutomatica,
        DOMAIN_EVENT_PUBLISHER,
        TENANT_TX_RUNNER,
      ],
    },
    {
      provide: ListarReparacionesUseCase,
      useFactory: (
        ediliciaRepo: ITicketEdiliciaRepository,
        ticketRepo: ITicketRepository,
        tareaRepo: ITareaTicketRepository,
        comentarioRepo: IComentarioReparacionRepository,
        reparacionCompraRepo: IReparacionCompraRepository,
      ) =>
        new ListarReparacionesUseCase(
          ediliciaRepo,
          ticketRepo,
          tareaRepo,
          comentarioRepo,
          reparacionCompraRepo,
        ),
      inject: [
        TICKET_EDILICIA_REPOSITORY,
        TICKET_REPOSITORY,
        TAREA_TICKET_REPOSITORY,
        COMENTARIO_REPARACION_REPOSITORY,
        REPARACION_COMPRA_REPOSITORY,
      ],
    },
    // odd/tareas-con-tecnico T3: las rutas viejas de subtareas delegan en los casos de uso de
    // tareas del ticket (exportados por `TicketsModule`). T8 retira estas tres clases, las rutas y
    // `CrearSubtareaUseCase`/`CompletarSubtareaUseCase`/`EliminarSubtareaUseCase`, que ya no se
    // registran.
    {
      provide: CrearSubtareaSobreTareaUseCase,
      useFactory: (ediliciaRepo: ITicketEdiliciaRepository, crearTarea: CrearTareaTicketUseCase) =>
        new CrearSubtareaSobreTareaUseCase(ediliciaRepo, crearTarea),
      inject: [TICKET_EDILICIA_REPOSITORY, CrearTareaTicketUseCase],
    },
    {
      provide: CompletarSubtareaSobreTareaUseCase,
      useFactory: (
        tareaRepo: ITareaTicketRepository,
        ediliciaRepo: ITicketEdiliciaRepository,
        completarTarea: CompletarTareaUseCase,
      ) => new CompletarSubtareaSobreTareaUseCase(tareaRepo, ediliciaRepo, completarTarea),
      inject: [TAREA_TICKET_REPOSITORY, TICKET_EDILICIA_REPOSITORY, CompletarTareaUseCase],
    },
    {
      provide: EliminarSubtareaSobreTareaUseCase,
      useFactory: (
        tareaRepo: ITareaTicketRepository,
        ediliciaRepo: ITicketEdiliciaRepository,
        eliminarTarea: EliminarTareaUseCase,
      ) => new EliminarSubtareaSobreTareaUseCase(tareaRepo, ediliciaRepo, eliminarTarea),
      inject: [TAREA_TICKET_REPOSITORY, TICKET_EDILICIA_REPOSITORY, EliminarTareaUseCase],
    },
    {
      provide: CrearComentarioReparacionUseCase,
      useFactory: (
        ticketEdiliciaRepo: ITicketEdiliciaRepository,
        comentarioRepo: IComentarioReparacionRepository,
      ) => new CrearComentarioReparacionUseCase(ticketEdiliciaRepo, comentarioRepo),
      inject: [TICKET_EDILICIA_REPOSITORY, COMENTARIO_REPARACION_REPOSITORY],
    },
    {
      provide: ListarComentariosReparacionUseCase,
      useFactory: (
        ticketEdiliciaRepo: ITicketEdiliciaRepository,
        comentarioRepo: IComentarioReparacionRepository,
      ) => new ListarComentariosReparacionUseCase(ticketEdiliciaRepo, comentarioRepo),
      inject: [TICKET_EDILICIA_REPOSITORY, COMENTARIO_REPARACION_REPOSITORY],
    },
    {
      // Compone `ListarReparacionesUseCase` (design D4, sdd/exportar-listados-csv)
      // — NO inyecta ninguno de sus 4 repositorios directamente.
      provide: ExportarReparacionesUseCase,
      useFactory: (listarReparacionesUseCase: ListarReparacionesUseCase) =>
        new ExportarReparacionesUseCase(listarReparacionesUseCase),
      inject: [ListarReparacionesUseCase],
    },
    {
      // WU5, sdd/reparacion-bloqueada-por-compra — D7: valida existencia de
      // la compra vía COMPRA_REPOSITORY (de ComprasModule), sin tocar su firma.
      provide: VincularCompraAReparacionUseCase,
      useFactory: (
        ticketEdiliciaRepo: ITicketEdiliciaRepository,
        compraRepo: ICompraRepository,
        reparacionCompraRepo: IReparacionCompraRepository,
      ) =>
        new VincularCompraAReparacionUseCase(ticketEdiliciaRepo, compraRepo, reparacionCompraRepo),
      inject: [TICKET_EDILICIA_REPOSITORY, COMPRA_REPOSITORY, REPARACION_COMPRA_REPOSITORY],
    },
    {
      provide: DesvincularCompraDeReparacionUseCase,
      useFactory: (reparacionCompraRepo: IReparacionCompraRepository) =>
        new DesvincularCompraDeReparacionUseCase(reparacionCompraRepo),
      inject: [REPARACION_COMPRA_REPOSITORY],
    },
  ],
  exports: [
    TICKET_EDILICIA_REPOSITORY,
    SUBTAREA_EDILICIA_REPOSITORY,
    COMENTARIO_REPARACION_REPOSITORY,
  ],
})
export class ReparacionesModule {}
