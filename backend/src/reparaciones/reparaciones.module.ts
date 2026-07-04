/**
 * ReparacionesModule — módulo NestJS del dominio de reparaciones edilicias (Fase 5).
 *
 * Cablea todos los providers de la Fase 5:
 * - Importa TicketsModule para acceder a los repos de tickets-core y al
 *   TICKET_STATE_MACHINE_FACTORY (singleton compartido).
 * - Importa AuthModule para JwtAuthGuard + TOKEN_SERVICE.
 * - Provee los repos de reparaciones (ubicaciones, ticket_edilicia, subtareas_edilicia).
 * - Instancia todos los use cases de reparaciones via useFactory.
 * - Guards: RolesGuard, PermissionsGuard, TenantGuard.
 * - Controllers: UbicacionesController, TicketsEdilicioController, SubtareasController.
 *
 * Registro de EdiliciaStateMachine:
 * onModuleInit inyecta el TICKET_STATE_MACHINE_FACTORY (exportado por TicketsModule)
 * y registra la EdiliciaStateMachine para el código 'EDILICIA'. Esto garantiza que
 * TransicionarEstadoUseCase (en TicketsModule) resuelva la máquina correcta cuando
 * procesa tickets de tipo EDILICIA.
 *
 * NestJS DI notas:
 * - SharedModule es @Global → TENANT_TRANSACTION_RUNNER ya está disponible sin importar.
 * - TicketsModule exporta: TICKET_REPOSITORY, OPERACION_TICKET_REPOSITORY,
 *   ESTADO_REPOSITORY, TIPO_TICKET_REPOSITORY, TIPO_OPERACION_REPOSITORY,
 *   USUARIO_MASTER_CHECKER, NumeradorTicket, TICKET_STATE_MACHINE_FACTORY.
 * - NO re-declarar PrismaService — viene del SharedModule @Global.
 *
 * Tarea: 5.D.2
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

// ─── Fase 4 (ciclos-master-tenant) — colaborador de aplicación compartido ────
// Exportado por TicketsModule junto con CICLO_CLIENTE_REPOSITORY (ADR-1/ADR-4-Repo).
import { ResolverCicloActivoParaCreacion } from '../tickets/application/services/resolver-ciclo-activo.service';

// ─── Shared tokens ────────────────────────────────────────────────────────────
import {
  TENANT_TRANSACTION_RUNNER,
  ITenantTransactionRunner,
} from '../shared/infrastructure/persistence/tenant-transaction-runner';

// ─── Reparaciones domain ports ────────────────────────────────────────────────
import { UBICACION_REPOSITORY, IUbicacionRepository } from './domain/ports/i-ubicacion.repository';
import {
  TICKET_EDILICIA_REPOSITORY,
  ITicketEdiliciaRepository,
} from './domain/ports/i-ticket-edilicia.repository';
import {
  SUBTAREA_EDILICIA_REPOSITORY,
  ISubtareaEdiliciaRepository,
} from './domain/ports/i-subtarea-edilicia.repository';

// ─── Reparaciones domain state machine ───────────────────────────────────────
import { EdiliciaStateMachine } from './domain/state-machine/edilicia-state-machine';

// ─── Reparaciones infrastructure ──────────────────────────────────────────────
import { PrismaUbicacionRepository } from './infrastructure/persistence/prisma/prisma-ubicacion.repository';
import { PrismaTicketEdiliciaRepository } from './infrastructure/persistence/prisma/prisma-ticket-edilicia.repository';
import { PrismaSubtareaEdiliciaRepository } from './infrastructure/persistence/prisma/prisma-subtarea-edilicia.repository';

// ─── Use cases ────────────────────────────────────────────────────────────────
import { ListarReparacionesUseCase } from './application/use-cases/listar-reparaciones.use-case';
import { CrearUbicacionUseCase } from './application/use-cases/crear-ubicacion.use-case';
import { EliminarUbicacionUseCase } from './application/use-cases/eliminar-ubicacion.use-case';
import { CrearTicketEdilicioUseCase } from './application/use-cases/crear-ticket-edilicio.use-case';
import { CrearSubtareaUseCase } from './application/use-cases/crear-subtarea.use-case';
import { CompletarSubtareaUseCase } from './application/use-cases/completar-subtarea.use-case';

// ─── Guards ───────────────────────────────────────────────────────────────────
import { RolesGuard } from '../auth/infrastructure/guards/roles.guard';
import { PermissionsGuard } from '../auth/infrastructure/guards/permissions.guard';
import { TenantGuard } from '../auth/infrastructure/guards/tenant.guard';

// ─── Controllers ──────────────────────────────────────────────────────────────
import { ReparacionesController } from './interface/controllers/reparaciones.controller';
import { UbicacionesController } from './interface/controllers/ubicaciones.controller';
import { TicketsEdilicioController } from './interface/controllers/tickets-edilicio.controller';
import { SubtareasController } from './interface/controllers/subtareas.controller';

// ─── Module ───────────────────────────────────────────────────────────────────

@Module({
  imports: [
    // AuthModule exporta: TOKEN_SERVICE + JwtAuthGuard
    AuthModule,
    // TicketsModule exporta: repos tickets-core + NumeradorTicket + TICKET_STATE_MACHINE_FACTORY
    TicketsModule,
  ],
  controllers: [
    ReparacionesController,
    UbicacionesController,
    TicketsEdilicioController,
    SubtareasController,
  ],
  providers: [
    // ─── Repos reparaciones (tenant) ──────────────────────────────────────────
    // Usan TenantContext (@Global desde SharedModule) para obtener el PrismaClient del tenant.
    {
      provide: UBICACION_REPOSITORY,
      useClass: PrismaUbicacionRepository,
    },
    {
      provide: TICKET_EDILICIA_REPOSITORY,
      useClass: PrismaTicketEdiliciaRepository,
    },
    {
      provide: SUBTAREA_EDILICIA_REPOSITORY,
      useClass: PrismaSubtareaEdiliciaRepository,
    },

    // ─── Use cases (plain classes, instanciados via useFactory) ──────────────

    {
      provide: CrearUbicacionUseCase,
      useFactory: (ubicacionRepo: IUbicacionRepository, txRunner: ITenantTransactionRunner) =>
        new CrearUbicacionUseCase(ubicacionRepo, txRunner),
      inject: [UBICACION_REPOSITORY, TENANT_TRANSACTION_RUNNER],
    },

    {
      provide: EliminarUbicacionUseCase,
      useFactory: (
        ubicacionRepo: IUbicacionRepository,
        ticketEdiliciaRepo: ITicketEdiliciaRepository,
        operacionRepo: IOperacionTicketRepository,
        tipoOperacionRepo: ITipoOperacionRepository,
        txRunner: ITenantTransactionRunner,
      ) =>
        new EliminarUbicacionUseCase(
          ubicacionRepo,
          ticketEdiliciaRepo,
          operacionRepo,
          tipoOperacionRepo,
          txRunner,
        ),
      inject: [
        UBICACION_REPOSITORY,
        TICKET_EDILICIA_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        TENANT_TRANSACTION_RUNNER,
      ],
    },

    {
      provide: CrearTicketEdilicioUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        operacionRepo: IOperacionTicketRepository,
        estadoRepo: IEstadoRepository,
        checker: IUsuarioMasterChecker,
        tipoTicketRepo: ITipoTicketRepository,
        tipoOpRepo: ITipoOperacionRepository,
        numerador: NumeradorTicket,
        txRunner: ITenantTransactionRunner,
        ticketEdiliciaRepo: ITicketEdiliciaRepository,
        ubicacionRepo: IUbicacionRepository,
        resolverCicloActivo: ResolverCicloActivoParaCreacion,
      ) =>
        new CrearTicketEdilicioUseCase(
          ticketRepo,
          operacionRepo,
          estadoRepo,
          checker,
          tipoTicketRepo,
          tipoOpRepo,
          numerador,
          txRunner,
          ticketEdiliciaRepo,
          ubicacionRepo,
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
        TICKET_EDILICIA_REPOSITORY,
        UBICACION_REPOSITORY,
        // Fase 4 (ciclos-master-tenant, ADR-1): resuelto vía export de TicketsModule.
        ResolverCicloActivoParaCreacion,
      ],
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
        TENANT_TRANSACTION_RUNNER,
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
        TENANT_TRANSACTION_RUNNER,
      ],
    },

    {
      provide: ListarReparacionesUseCase,
      useFactory: (
        ediliciaRepo: ITicketEdiliciaRepository,
        ticketRepo: ITicketRepository,
        ubicacionRepo: IUbicacionRepository,
        cicloRepo: ICicloClienteRepository,
      ) => new ListarReparacionesUseCase(ediliciaRepo, ticketRepo, ubicacionRepo, cicloRepo),
      inject: [
        TICKET_EDILICIA_REPOSITORY,
        TICKET_REPOSITORY,
        UBICACION_REPOSITORY,
        // Fase 4 (ciclos-master-tenant, ADR-4-Repo): resuelto vía export de TicketsModule.
        CICLO_CLIENTE_REPOSITORY,
      ],
    },

    // ─── Guards ──────────────────────────────────────────────────────────────
    // JwtAuthGuard es exportado por AuthModule → no re-declarar aquí.
    RolesGuard,
    PermissionsGuard,
    TenantGuard,
  ],
})
export class ReparacionesModule implements OnModuleInit {
  constructor(
    @Inject(TICKET_STATE_MACHINE_FACTORY)
    private readonly factory: TicketStateMachineFactory,
  ) {}

  /**
   * Registra EdiliciaStateMachine en el TICKET_STATE_MACHINE_FACTORY compartido.
   *
   * Al registrarse aquí, el singleton de la factory (proveniente de TicketsModule)
   * queda actualizado. Cuando TransicionarEstadoUseCase resuelve la máquina para
   * un ticket de tipo 'EDILICIA', ya encuentra EdiliciaStateMachine registrada.
   *
   * NOTA NestJS 11: .compile() NO dispara onModuleInit. Para testear el registro
   * en la factory, usar await moduleRef.init() después del compile().
   *
   * Ref: [DESIGN:Máquina de estados Strategy por tipo]
   * Ref: edilicia-state-machine.ts (docstring)
   */
  onModuleInit(): void {
    this.factory.register('EDILICIA', new EdiliciaStateMachine());
  }
}
