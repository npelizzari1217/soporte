import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TicketsModule } from '../tickets/tickets.module';

import { TICKET_REPOSITORY, ITicketRepository } from '../tickets/domain/ports/i-ticket.repository';
import {
  OPERACION_TICKET_REPOSITORY,
  IOperacionTicketRepository,
} from '../tickets/domain/ports/i-operacion-ticket.repository';
import {
  ARCHIVO_REPOSITORY,
  IArchivoRepository,
} from '../tickets/domain/ports/i-archivo.repository';
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
import { IFileStorage, FILE_STORAGE } from '../shared/domain/ports/i-file-storage';

import {
  TICKET_COMPRA_REPOSITORY,
  ITicketCompraRepository,
} from './domain/ports/i-ticket-compra.repository';
import { PrismaTicketCompraRepository } from './infrastructure/persistence/prisma/prisma-ticket-compra.repository';
import {
  ITEM_COMPRA_REPOSITORY,
  IItemCompraRepository,
} from './domain/ports/i-item-compra.repository';
import { PrismaItemCompraRepository } from './infrastructure/persistence/prisma/prisma-item-compra.repository';
import {
  PRESUPUESTO_REPOSITORY,
  IPresupuestoRepository,
} from './domain/ports/i-presupuesto.repository';
import { PrismaPresupuestoRepository } from './infrastructure/persistence/prisma/prisma-presupuesto.repository';

import { CrearTicketCompraUseCase } from './application/use-cases/crear-ticket-compra.use-case';
import { ListarComprasUseCase } from './application/use-cases/listar-compras.use-case';
import { ObtenerCompraUseCase } from './application/use-cases/obtener-compra.use-case';
import { AgregarItemCompraUseCase } from './application/use-cases/agregar-item-compra.use-case';
import { EliminarItemCompraUseCase } from './application/use-cases/eliminar-item-compra.use-case';
import { AgregarPresupuestoUseCase } from './application/use-cases/agregar-presupuesto.use-case';
import { SeleccionarPresupuestoUseCase } from './application/use-cases/seleccionar-presupuesto.use-case';
import { AdjuntarPresupuestoUseCase } from './application/use-cases/adjuntar-presupuesto.use-case';
import { AprobarCompraUseCase } from './application/use-cases/aprobar-compra.use-case';
import { RechazarCompraUseCase } from './application/use-cases/rechazar-compra.use-case';

import { ComprasController } from './interface/controllers/compras.controller';

/**
 * ComprasModule — módulo NestJS del dominio "compras" (Fase 3, F3-C1..C6).
 *
 * Flujo de compras: ticket_compra (satélite 1:0..1 de Ticket), items de
 * compra, presupuestos de proveedores (con adjunto), aprobación en un solo
 * paso (ADR-1, sin estados custom).
 *
 * Wiring (PR2-PR5, screaming module hexagonal — domain/ → application/ →
 * infrastructure/ → interface/):
 * - Importa `TicketsModule` para reusar sus providers EXPORTADOS
 *   (TICKET_REPOSITORY, OPERACION_TICKET_REPOSITORY, ARCHIVO_REPOSITORY,
 *   ESTADO_REPOSITORY, TIPO_TICKET_REPOSITORY, TIPO_OPERACION_REPOSITORY,
 *   USUARIO_MASTER_CHECKER) — NO se reimplementan, se inyectan por token
 *   (mismo patrón que `TicketsModule` inyecta `SharedModule`, `@Global`).
 * - `NumeradorTicket`/`ResolverCicloActivoParaCreacion` son clases planas
 *   (sin `@Injectable`) — se resuelven vía `useFactory` inyectando sus
 *   puertos por token, igual que en `TicketsModule`.
 * - `TICKET_TX_RUNNER`/`FILE_STORAGE` se inyectan desde `SharedModule`
 *   (`@Global`, sin necesidad de reimportarlo).
 * - `ComprasController` expone `POST/GET /compras`, ítems, presupuestos
 *   (adjuntos, selección), aprobar/rechazar.
 *
 * FITNESS RULE: PrismaService y @prisma/client solo pueden importarse desde
 * infrastructure/ (ver backend/eslint.config.js).
 */
@Module({
  // AuthModule: JwtAuthGuard/TenantGuard/PermissionsGuard de ComprasController
  // dependen de TOKEN_SERVICE/etc. — TicketsModule NO re-exporta AuthModule
  // (solo sus propios tokens de dominio), así que hay que importarlo acá
  // explícitamente (mismo patrón que DashboardModule/SlaModule/KbModule).
  // Sin esto, `AppModule` completo no bootstrapea: UnknownDependenciesException
  // en JwtAuthGuard (descubierto por sdd/beta-frontend B6, T6.2).
  imports: [AuthModule, TicketsModule],
  controllers: [ComprasController],
  providers: [
    { provide: TICKET_COMPRA_REPOSITORY, useClass: PrismaTicketCompraRepository },
    { provide: ITEM_COMPRA_REPOSITORY, useClass: PrismaItemCompraRepository },
    { provide: PRESUPUESTO_REPOSITORY, useClass: PrismaPresupuestoRepository },

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
      provide: CrearTicketCompraUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        operacionRepo: IOperacionTicketRepository,
        ticketCompraRepo: ITicketCompraRepository,
        estadoRepo: IEstadoRepository,
        tipoTicketRepo: ITipoTicketRepository,
        tipoOperacionRepo: ITipoOperacionRepository,
        usuarioMasterChecker: IUsuarioMasterChecker,
        numerador: NumeradorTicket,
        resolverCicloActivo: ResolverCicloActivoParaCreacion,
        txRunner: ITenantTransactionRunner,
      ) =>
        new CrearTicketCompraUseCase(
          ticketRepo,
          operacionRepo,
          ticketCompraRepo,
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
        TICKET_COMPRA_REPOSITORY,
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
      provide: ListarComprasUseCase,
      useFactory: (ticketCompraRepo: ITicketCompraRepository, ticketRepo: ITicketRepository) =>
        new ListarComprasUseCase(ticketCompraRepo, ticketRepo),
      inject: [TICKET_COMPRA_REPOSITORY, TICKET_REPOSITORY],
    },
    {
      provide: ObtenerCompraUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        ticketCompraRepo: ITicketCompraRepository,
        itemCompraRepo: IItemCompraRepository,
        presupuestoRepo: IPresupuestoRepository,
      ) => new ObtenerCompraUseCase(ticketRepo, ticketCompraRepo, itemCompraRepo, presupuestoRepo),
      inject: [
        TICKET_REPOSITORY,
        TICKET_COMPRA_REPOSITORY,
        ITEM_COMPRA_REPOSITORY,
        PRESUPUESTO_REPOSITORY,
      ],
    },
    {
      provide: AgregarItemCompraUseCase,
      useFactory: (
        ticketCompraRepo: ITicketCompraRepository,
        itemCompraRepo: IItemCompraRepository,
      ) => new AgregarItemCompraUseCase(ticketCompraRepo, itemCompraRepo),
      inject: [TICKET_COMPRA_REPOSITORY, ITEM_COMPRA_REPOSITORY],
    },
    {
      provide: EliminarItemCompraUseCase,
      useFactory: (itemCompraRepo: IItemCompraRepository) =>
        new EliminarItemCompraUseCase(itemCompraRepo),
      inject: [ITEM_COMPRA_REPOSITORY],
    },
    {
      provide: AgregarPresupuestoUseCase,
      useFactory: (
        ticketCompraRepo: ITicketCompraRepository,
        presupuestoRepo: IPresupuestoRepository,
      ) => new AgregarPresupuestoUseCase(ticketCompraRepo, presupuestoRepo),
      inject: [TICKET_COMPRA_REPOSITORY, PRESUPUESTO_REPOSITORY],
    },
    {
      provide: SeleccionarPresupuestoUseCase,
      useFactory: (presupuestoRepo: IPresupuestoRepository, txRunner: ITenantTransactionRunner) =>
        new SeleccionarPresupuestoUseCase(presupuestoRepo, txRunner),
      inject: [PRESUPUESTO_REPOSITORY, TENANT_TX_RUNNER],
    },
    {
      provide: AdjuntarPresupuestoUseCase,
      useFactory: (
        presupuestoRepo: IPresupuestoRepository,
        archivoRepo: IArchivoRepository,
        fileStorage: IFileStorage,
        txRunner: ITenantTransactionRunner,
      ) => new AdjuntarPresupuestoUseCase(presupuestoRepo, archivoRepo, fileStorage, txRunner),
      inject: [PRESUPUESTO_REPOSITORY, ARCHIVO_REPOSITORY, FILE_STORAGE, TENANT_TX_RUNNER],
    },
    {
      provide: AprobarCompraUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        ticketCompraRepo: ITicketCompraRepository,
        operacionRepo: IOperacionTicketRepository,
        tipoOperacionRepo: ITipoOperacionRepository,
        txRunner: ITenantTransactionRunner,
      ) =>
        new AprobarCompraUseCase(
          ticketRepo,
          ticketCompraRepo,
          operacionRepo,
          tipoOperacionRepo,
          txRunner,
        ),
      inject: [
        TICKET_REPOSITORY,
        TICKET_COMPRA_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        TENANT_TX_RUNNER,
      ],
    },
    {
      provide: RechazarCompraUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        ticketCompraRepo: ITicketCompraRepository,
        operacionRepo: IOperacionTicketRepository,
        estadoRepo: IEstadoRepository,
        tipoOperacionRepo: ITipoOperacionRepository,
        txRunner: ITenantTransactionRunner,
      ) =>
        new RechazarCompraUseCase(
          ticketRepo,
          ticketCompraRepo,
          operacionRepo,
          estadoRepo,
          tipoOperacionRepo,
          txRunner,
        ),
      inject: [
        TICKET_REPOSITORY,
        TICKET_COMPRA_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        ESTADO_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        TENANT_TX_RUNNER,
      ],
    },
  ],
  exports: [TICKET_COMPRA_REPOSITORY, ITEM_COMPRA_REPOSITORY, PRESUPUESTO_REPOSITORY],
})
export class ComprasModule {}
