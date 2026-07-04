/**
 * ComprasModule — módulo NestJS del dominio de compras (Fase 4).
 *
 * Cablea todos los providers de la Fase 4:
 * - Importa TicketsModule para acceder a los repos de tickets-core y al
 *   TICKET_STATE_MACHINE_FACTORY (singleton compartido).
 * - Importa AuthModule para JwtAuthGuard + TOKEN_SERVICE.
 * - Provee los repos de compras (ticket_compra, items_compra, presupuestos).
 * - Instancia todos los use cases de compras via useFactory.
 * - Guards: RolesGuard, PermissionsGuard, TenantGuard.
 * - Controllers: ComprasController, ItemsCompraController, PresupuestosController.
 *
 * Registro de ComprasStateMachine:
 * onModuleInit inyecta el TICKET_STATE_MACHINE_FACTORY (exportado por TicketsModule)
 * y registra la ComprasStateMachine para el código 'COMPRAS'. Esto garantiza que
 * TransicionarEstadoUseCase (en TicketsModule) resuelva la máquina correcta cuando
 * procesa tickets de tipo COMPRAS.
 *
 * NestJS DI notas:
 * - SharedModule es @Global → TENANT_TRANSACTION_RUNNER ya está disponible sin importar.
 * - TicketsModule exporta: TICKET_REPOSITORY, OPERACION_TICKET_REPOSITORY,
 *   ESTADO_REPOSITORY, TIPO_TICKET_REPOSITORY, TIPO_OPERACION_REPOSITORY,
 *   USUARIO_MASTER_CHECKER, NumeradorTicket, TICKET_STATE_MACHINE_FACTORY.
 * - NO re-declarar PrismaService — viene del SharedModule @Global.
 *
 * Tarea: 4.D.2
 */
import { Module, OnModuleInit } from '@nestjs/common';
import { Inject } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { TicketsModule } from '../tickets/tickets.module';

// ─── Tokens tickets-core (disponibles via TicketsModule exports) ───────────────
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
import { NumeradorTicket } from '../tickets/domain/services/numerador-ticket.service';
import {
  TicketStateMachineFactory,
  TICKET_STATE_MACHINE_FACTORY,
} from '../tickets/domain/state-machine/ticket-state-machine.factory';
import {
  CICLO_CLIENTE_REPOSITORY,
  ICicloClienteRepository,
} from '../tickets/domain/ports/i-ciclo-cliente.repository';
import { ResolverCicloActivoParaCreacion } from '../tickets/application/services/resolver-ciclo-activo.service';

// ─── Shared tokens ────────────────────────────────────────────────────────────
import {
  TENANT_TRANSACTION_RUNNER,
  ITenantTransactionRunner,
} from '../shared/infrastructure/persistence/tenant-transaction-runner';

// ─── Compras domain ports ─────────────────────────────────────────────────────
import {
  TICKET_COMPRA_REPOSITORY,
  ITicketCompraRepository,
} from './domain/ports/i-ticket-compra.repository';
import {
  ITEM_COMPRA_REPOSITORY,
  IItemCompraRepository,
} from './domain/ports/i-item-compra.repository';
import {
  PRESUPUESTO_REPOSITORY,
  IPresupuestoRepository,
} from './domain/ports/i-presupuesto.repository';

// ─── Compras domain state machine ─────────────────────────────────────────────
import { ComprasStateMachine } from './domain/state-machine/compras-state-machine';

// ─── Compras infrastructure ────────────────────────────────────────────────────
import { PrismaTicketCompraRepository } from './infrastructure/persistence/prisma/prisma-ticket-compra.repository';
import { PrismaItemCompraRepository } from './infrastructure/persistence/prisma/prisma-item-compra.repository';
import { PrismaPresupuestoRepository } from './infrastructure/persistence/prisma/prisma-presupuesto.repository';

// ─── Use cases ────────────────────────────────────────────────────────────────
import { ListarComprasUseCase } from './application/use-cases/listar-compras.use-case';
import { CrearTicketCompraUseCase } from './application/use-cases/crear-ticket-compra.use-case';
import { EnviarAAprobacionUseCase } from './application/use-cases/enviar-a-aprobacion.use-case';
import { AprobarCompraUseCase } from './application/use-cases/aprobar-compra.use-case';
import { RechazarCompraUseCase } from './application/use-cases/rechazar-compra.use-case';
import { SeleccionarPresupuestoUseCase } from './application/use-cases/seleccionar-presupuesto.use-case';
import { AgregarItemCompraUseCase } from './application/use-cases/agregar-item-compra.use-case';
import { EliminarItemCompraUseCase } from './application/use-cases/eliminar-item-compra.use-case';
import { AgregarPresupuestoUseCase } from './application/use-cases/agregar-presupuesto.use-case';

// ─── Guards ───────────────────────────────────────────────────────────────────
import { RolesGuard } from '../auth/infrastructure/guards/roles.guard';
import { PermissionsGuard } from '../auth/infrastructure/guards/permissions.guard';
import { TenantGuard } from '../auth/infrastructure/guards/tenant.guard';

// ─── Controllers ──────────────────────────────────────────────────────────────
import { ComprasController } from './interface/controllers/compras.controller';
import { ItemsCompraController } from './interface/controllers/items-compra.controller';
import { PresupuestosController } from './interface/controllers/presupuestos.controller';

// ─── Module ───────────────────────────────────────────────────────────────────

@Module({
  imports: [
    // AuthModule exporta: TOKEN_SERVICE + JwtAuthGuard
    AuthModule,
    // TicketsModule exporta: repos tickets-core + NumeradorTicket + TICKET_STATE_MACHINE_FACTORY
    TicketsModule,
  ],
  controllers: [ComprasController, ItemsCompraController, PresupuestosController],
  providers: [
    // ─── Repos compras (tenant) ───────────────────────────────────────────────
    // Usan TenantContext (@Global desde SharedModule) para obtener el PrismaClient del tenant.
    {
      provide: TICKET_COMPRA_REPOSITORY,
      useClass: PrismaTicketCompraRepository,
    },
    {
      provide: ITEM_COMPRA_REPOSITORY,
      useClass: PrismaItemCompraRepository,
    },
    {
      provide: PRESUPUESTO_REPOSITORY,
      useClass: PrismaPresupuestoRepository,
    },

    // ─── Use cases (plain classes, instanciados via useFactory) ──────────────

    {
      provide: CrearTicketCompraUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        operacionRepo: IOperacionTicketRepository,
        estadoRepo: IEstadoRepository,
        checker: IUsuarioMasterChecker,
        tipoTicketRepo: ITipoTicketRepository,
        tipoOpRepo: ITipoOperacionRepository,
        numerador: NumeradorTicket,
        txRunner: ITenantTransactionRunner,
        ticketCompraRepo: ITicketCompraRepository,
        resolverCicloActivo: ResolverCicloActivoParaCreacion,
      ) =>
        new CrearTicketCompraUseCase(
          ticketRepo,
          operacionRepo,
          estadoRepo,
          checker,
          tipoTicketRepo,
          tipoOpRepo,
          numerador,
          txRunner,
          ticketCompraRepo,
          resolverCicloActivo,
        ),
      inject: [
        TICKET_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        ESTADO_REPOSITORY,
        USUARIO_MASTER_CHECKER,
        TIPO_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        NumeradorTicket,
        TENANT_TRANSACTION_RUNNER,
        TICKET_COMPRA_REPOSITORY,
        // Fase 4 (ciclos-master-tenant, ADR-1/ADR-4-Repo): ResolverCicloActivoParaCreacion
        // es exportado por TicketsModule (ya importado arriba) — resuelve el ciclo
        // ACTIVO del tenant vía CICLO_CLIENTE_REPOSITORY (lado tickets, NO el admin).
        ResolverCicloActivoParaCreacion,
      ],
    },

    {
      provide: EnviarAAprobacionUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        ticketCompraRepo: ITicketCompraRepository,
        itemCompraRepo: IItemCompraRepository,
        operacionRepo: IOperacionTicketRepository,
        estadoRepo: IEstadoRepository,
        tipoTicketRepo: ITipoTicketRepository,
        tipoOpRepo: ITipoOperacionRepository,
        factory: TicketStateMachineFactory,
        txRunner: ITenantTransactionRunner,
      ) =>
        new EnviarAAprobacionUseCase(
          ticketRepo,
          ticketCompraRepo,
          itemCompraRepo,
          operacionRepo,
          estadoRepo,
          tipoTicketRepo,
          tipoOpRepo,
          factory,
          txRunner,
        ),
      inject: [
        TICKET_REPOSITORY,
        TICKET_COMPRA_REPOSITORY,
        ITEM_COMPRA_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        ESTADO_REPOSITORY,
        TIPO_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        TICKET_STATE_MACHINE_FACTORY,
        TENANT_TRANSACTION_RUNNER,
      ],
    },

    {
      provide: AprobarCompraUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        ticketCompraRepo: ITicketCompraRepository,
        operacionRepo: IOperacionTicketRepository,
        estadoRepo: IEstadoRepository,
        tipoOpRepo: ITipoOperacionRepository,
        tipoTicketRepo: ITipoTicketRepository,
        factory: TicketStateMachineFactory,
        txRunner: ITenantTransactionRunner,
      ) =>
        new AprobarCompraUseCase(
          ticketRepo,
          ticketCompraRepo,
          operacionRepo,
          estadoRepo,
          tipoOpRepo,
          tipoTicketRepo,
          factory,
          txRunner,
        ),
      inject: [
        TICKET_REPOSITORY,
        TICKET_COMPRA_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        ESTADO_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        TIPO_TICKET_REPOSITORY,
        TICKET_STATE_MACHINE_FACTORY,
        TENANT_TRANSACTION_RUNNER,
      ],
    },

    {
      provide: RechazarCompraUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        ticketCompraRepo: ITicketCompraRepository,
        operacionRepo: IOperacionTicketRepository,
        estadoRepo: IEstadoRepository,
        tipoOpRepo: ITipoOperacionRepository,
        tipoTicketRepo: ITipoTicketRepository,
        factory: TicketStateMachineFactory,
        txRunner: ITenantTransactionRunner,
      ) =>
        new RechazarCompraUseCase(
          ticketRepo,
          ticketCompraRepo,
          operacionRepo,
          estadoRepo,
          tipoOpRepo,
          tipoTicketRepo,
          factory,
          txRunner,
        ),
      inject: [
        TICKET_REPOSITORY,
        TICKET_COMPRA_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        ESTADO_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        TIPO_TICKET_REPOSITORY,
        TICKET_STATE_MACHINE_FACTORY,
        TENANT_TRANSACTION_RUNNER,
      ],
    },

    {
      provide: SeleccionarPresupuestoUseCase,
      useFactory: (presupuestoRepo: IPresupuestoRepository, txRunner: ITenantTransactionRunner) =>
        new SeleccionarPresupuestoUseCase(presupuestoRepo, txRunner),
      inject: [PRESUPUESTO_REPOSITORY, TENANT_TRANSACTION_RUNNER],
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
      provide: ListarComprasUseCase,
      useFactory: (
        ticketCompraRepo: ITicketCompraRepository,
        ticketRepo: ITicketRepository,
        cicloRepo: ICicloClienteRepository,
      ) => new ListarComprasUseCase(ticketCompraRepo, ticketRepo, cicloRepo),
      // Fase 4 (ADR-5): CICLO_CLIENTE_REPOSITORY exportado por TicketsModule
      // (ya importado arriba) — resuelve el ciclo activo cuando no viene ?cicloId.
      inject: [TICKET_COMPRA_REPOSITORY, TICKET_REPOSITORY, CICLO_CLIENTE_REPOSITORY],
    },

    // ─── Guards ──────────────────────────────────────────────────────────────
    // JwtAuthGuard es exportado por AuthModule → no re-declarar aquí.
    RolesGuard,
    PermissionsGuard,
    TenantGuard,
  ],
})
export class ComprasModule implements OnModuleInit {
  constructor(
    @Inject(TICKET_STATE_MACHINE_FACTORY)
    private readonly factory: TicketStateMachineFactory,
  ) {}

  /**
   * Registra ComprasStateMachine en el TICKET_STATE_MACHINE_FACTORY compartido.
   *
   * Al registrarse aquí, el singleton de la factory (proveniente de TicketsModule)
   * queda actualizado. Cuando TransicionarEstadoUseCase resuelve la máquina para
   * un ticket de tipo 'COMPRAS', ya encuentra ComprasStateMachine registrada.
   *
   * Ref: [DESIGN:Máquina de estados Strategy por tipo]
   * Ref: compras-state-machine.ts (docstring)
   */
  onModuleInit(): void {
    this.factory.register('COMPRAS', new ComprasStateMachine());
  }
}
