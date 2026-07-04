/**
 * EquiposModule — módulo NestJS del dominio de equipos informáticos (Fase 6).
 *
 * Cablea todos los providers de la Fase 6:
 * - Importa TicketsModule para acceder a los repos de tickets-core y al
 *   TICKET_STATE_MACHINE_FACTORY (singleton compartido).
 * - Importa AuthModule para JwtAuthGuard + TOKEN_SERVICE.
 * - Provee los repos de equipos (equipos_informaticos, componentes, tipos_componente, ticket_soporte).
 * - Instancia todos los use cases de equipos via useFactory.
 * - Guards: RolesGuard, PermissionsGuard, TenantGuard.
 * - Controllers: EquiposController, ComponentesController, TicketSoporteController.
 *
 * Cross-DB: AsignarEquipoUseCase y CrearTicketSoporteUseCase dependen de IUsuarioMasterChecker.
 * El checker se reutiliza desde TicketsModule (USUARIO_MASTER_CHECKER exportado) — NO se
 * duplica la implementación (UsuarioMasterChecker vive en tickets/infrastructure/).
 *
 * Fase 4 (ciclos-master-tenant, ADR-1/ADR-4-Repo): CrearTicketSoporteUseCase inyecta
 * ResolverCicloActivoParaCreacion (resuelto desde TicketsModule, que lo exporta junto a
 * CICLO_CLIENTE_REPOSITORY) para determinar el ciclo activo del tenant en creación —
 * el cliente ya NO provee cicloId. Sin ciclo activo → SinCicloActivoError → HTTP 409.
 *
 * State machine SOPORTE:
 * TicketStateMachineFactory usa BaseTicketStateMachine como fallback cuando no hay
 * una máquina registrada para el tipo pedido (resolve() → registry.get() ?? fallback).
 * 'SOPORTE' no tiene reglas de transición especiales en el spec, por lo que el
 * fallback BaseTicketStateMachine es suficiente: NO se registra nada en onModuleInit.
 *
 * NestJS DI notas:
 * - SharedModule es @Global → TENANT_TRANSACTION_RUNNER ya está disponible sin importar.
 * - TicketsModule exporta: TICKET_REPOSITORY, OPERACION_TICKET_REPOSITORY,
 *   ESTADO_REPOSITORY, TIPO_TICKET_REPOSITORY, TIPO_OPERACION_REPOSITORY,
 *   USUARIO_MASTER_CHECKER, NumeradorTicket, TICKET_STATE_MACHINE_FACTORY,
 *   CICLO_CLIENTE_REPOSITORY, ResolverCicloActivoParaCreacion.
 * - NO re-declarar PrismaService — viene del SharedModule @Global.
 *
 * Tarea: 6.D.2, 5.2 (Fase 4, PR5)
 */
import { Module } from '@nestjs/common';

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
import { ResolverCicloActivoParaCreacion } from '../tickets/application/services/resolver-ciclo-activo.service';

// ─── Shared tokens ────────────────────────────────────────────────────────────
import {
  TENANT_TRANSACTION_RUNNER,
  ITenantTransactionRunner,
} from '../shared/infrastructure/persistence/tenant-transaction-runner';

// ─── Equipos domain ports ─────────────────────────────────────────────────────
import {
  EQUIPO_INFORMATICO_REPOSITORY,
  IEquipoInformaticoRepository,
} from './domain/ports/i-equipo-informatico.repository';
import {
  COMPONENTE_EQUIPO_REPOSITORY,
  IComponenteEquipoRepository,
} from './domain/ports/i-componente-equipo.repository';
import {
  TIPOS_COMPONENTE_REPOSITORY,
  ITiposComponenteRepository,
} from './domain/ports/i-tipos-componente.repository';
import {
  TICKET_SOPORTE_REPOSITORY,
  ITicketSoporteRepository,
} from './domain/ports/i-ticket-soporte.repository';

// ─── Equipos infrastructure ───────────────────────────────────────────────────
import { PrismaEquipoInformaticoRepository } from './infrastructure/persistence/prisma/prisma-equipo-informatico.repository';
import { PrismaComponenteEquipoRepository } from './infrastructure/persistence/prisma/prisma-componente-equipo.repository';
import { PrismaTiposComponenteRepository } from './infrastructure/persistence/prisma/prisma-tipos-componente.repository';
import { PrismaTicketSoporteRepository } from './infrastructure/persistence/prisma/prisma-ticket-soporte.repository';

// ─── Use cases ────────────────────────────────────────────────────────────────
import { CrearEquipoUseCase } from './application/use-cases/crear-equipo.use-case';
import { EditarEquipoUseCase } from './application/use-cases/editar-equipo.use-case';
import { EliminarEquipoUseCase } from './application/use-cases/eliminar-equipo.use-case';
import { AsignarEquipoUseCase } from './application/use-cases/asignar-equipo.use-case';
import { ObtenerEquipoUseCase } from './application/use-cases/obtener-equipo.use-case';
import { ListarEquiposUseCase } from './application/use-cases/listar-equipos.use-case';
import { AgregarComponenteUseCase } from './application/use-cases/agregar-componente.use-case';
import { EliminarComponenteUseCase } from './application/use-cases/eliminar-componente.use-case';
import { ObtenerComponentesPorEquipoUseCase } from './application/use-cases/obtener-componentes-por-equipo.use-case';
import { CrearTicketSoporteUseCase } from './application/use-cases/crear-ticket-soporte.use-case';

// ─── Guards ───────────────────────────────────────────────────────────────────
import { RolesGuard } from '../auth/infrastructure/guards/roles.guard';
import { PermissionsGuard } from '../auth/infrastructure/guards/permissions.guard';
import { TenantGuard } from '../auth/infrastructure/guards/tenant.guard';

// ─── Controllers ──────────────────────────────────────────────────────────────
import { EquiposController } from './interface/controllers/equipos.controller';
import { ComponentesController } from './interface/controllers/componentes.controller';
import { TicketSoporteController } from './interface/controllers/ticket-soporte.controller';

// ─── Module ───────────────────────────────────────────────────────────────────

@Module({
  imports: [
    // AuthModule exporta: TOKEN_SERVICE + JwtAuthGuard
    AuthModule,
    // TicketsModule exporta: repos tickets-core + NumeradorTicket + TICKET_STATE_MACHINE_FACTORY
    // + USUARIO_MASTER_CHECKER (reutilizado por AsignarEquipoUseCase y CrearTicketSoporteUseCase)
    TicketsModule,
  ],
  controllers: [EquiposController, ComponentesController, TicketSoporteController],
  providers: [
    // ─── Repos equipos (tenant) ───────────────────────────────────────────────
    // Usan TenantContext (@Global desde SharedModule) para obtener el PrismaClient del tenant.
    {
      provide: EQUIPO_INFORMATICO_REPOSITORY,
      useClass: PrismaEquipoInformaticoRepository,
    },
    {
      provide: COMPONENTE_EQUIPO_REPOSITORY,
      useClass: PrismaComponenteEquipoRepository,
    },
    {
      provide: TIPOS_COMPONENTE_REPOSITORY,
      useClass: PrismaTiposComponenteRepository,
    },
    {
      provide: TICKET_SOPORTE_REPOSITORY,
      useClass: PrismaTicketSoporteRepository,
    },

    // ─── Use cases (plain classes, instanciados via useFactory) ──────────────

    {
      provide: CrearEquipoUseCase,
      useFactory: (equipoRepo: IEquipoInformaticoRepository, txRunner: ITenantTransactionRunner) =>
        new CrearEquipoUseCase(equipoRepo, txRunner),
      inject: [EQUIPO_INFORMATICO_REPOSITORY, TENANT_TRANSACTION_RUNNER],
    },

    {
      provide: EditarEquipoUseCase,
      useFactory: (equipoRepo: IEquipoInformaticoRepository, txRunner: ITenantTransactionRunner) =>
        new EditarEquipoUseCase(equipoRepo, txRunner),
      inject: [EQUIPO_INFORMATICO_REPOSITORY, TENANT_TRANSACTION_RUNNER],
    },

    {
      provide: EliminarEquipoUseCase,
      useFactory: (equipoRepo: IEquipoInformaticoRepository, txRunner: ITenantTransactionRunner) =>
        new EliminarEquipoUseCase(equipoRepo, txRunner),
      inject: [EQUIPO_INFORMATICO_REPOSITORY, TENANT_TRANSACTION_RUNNER],
    },

    {
      provide: AsignarEquipoUseCase,
      useFactory: (
        equipoRepo: IEquipoInformaticoRepository,
        checker: IUsuarioMasterChecker,
        txRunner: ITenantTransactionRunner,
      ) => new AsignarEquipoUseCase(equipoRepo, checker, txRunner),
      inject: [EQUIPO_INFORMATICO_REPOSITORY, USUARIO_MASTER_CHECKER, TENANT_TRANSACTION_RUNNER],
    },

    {
      provide: ObtenerEquipoUseCase,
      useFactory: (equipoRepo: IEquipoInformaticoRepository) =>
        new ObtenerEquipoUseCase(equipoRepo),
      inject: [EQUIPO_INFORMATICO_REPOSITORY],
    },

    {
      provide: ListarEquiposUseCase,
      useFactory: (equipoRepo: IEquipoInformaticoRepository) =>
        new ListarEquiposUseCase(equipoRepo),
      inject: [EQUIPO_INFORMATICO_REPOSITORY],
    },

    {
      provide: AgregarComponenteUseCase,
      useFactory: (
        equipoRepo: IEquipoInformaticoRepository,
        componenteRepo: IComponenteEquipoRepository,
        tiposRepo: ITiposComponenteRepository,
        txRunner: ITenantTransactionRunner,
      ) => new AgregarComponenteUseCase(equipoRepo, componenteRepo, tiposRepo, txRunner),
      inject: [
        EQUIPO_INFORMATICO_REPOSITORY,
        COMPONENTE_EQUIPO_REPOSITORY,
        TIPOS_COMPONENTE_REPOSITORY,
        TENANT_TRANSACTION_RUNNER,
      ],
    },

    {
      provide: EliminarComponenteUseCase,
      useFactory: (
        componenteRepo: IComponenteEquipoRepository,
        txRunner: ITenantTransactionRunner,
      ) => new EliminarComponenteUseCase(componenteRepo, txRunner),
      inject: [COMPONENTE_EQUIPO_REPOSITORY, TENANT_TRANSACTION_RUNNER],
    },

    {
      provide: ObtenerComponentesPorEquipoUseCase,
      useFactory: (
        equipoRepo: IEquipoInformaticoRepository,
        componenteRepo: IComponenteEquipoRepository,
      ) => new ObtenerComponentesPorEquipoUseCase(equipoRepo, componenteRepo),
      inject: [EQUIPO_INFORMATICO_REPOSITORY, COMPONENTE_EQUIPO_REPOSITORY],
    },

    {
      provide: CrearTicketSoporteUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        operacionRepo: IOperacionTicketRepository,
        estadoRepo: IEstadoRepository,
        checker: IUsuarioMasterChecker,
        tipoTicketRepo: ITipoTicketRepository,
        tipoOpRepo: ITipoOperacionRepository,
        numerador: NumeradorTicket,
        txRunner: ITenantTransactionRunner,
        ticketSoporteRepo: ITicketSoporteRepository,
        equipoRepo: IEquipoInformaticoRepository,
        resolverCicloActivo: ResolverCicloActivoParaCreacion,
      ) =>
        new CrearTicketSoporteUseCase(
          ticketRepo,
          operacionRepo,
          estadoRepo,
          checker,
          tipoTicketRepo,
          tipoOpRepo,
          numerador,
          txRunner,
          ticketSoporteRepo,
          equipoRepo,
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
        TICKET_SOPORTE_REPOSITORY,
        EQUIPO_INFORMATICO_REPOSITORY,
        // Fase 4 (ciclos-master-tenant, ADR-1/ADR-4-Repo): resuelto desde
        // TicketsModule (exportado junto a CICLO_CLIENTE_REPOSITORY).
        ResolverCicloActivoParaCreacion,
      ],
    },

    // ─── Guards ──────────────────────────────────────────────────────────────
    // JwtAuthGuard es exportado por AuthModule → no re-declarar aquí.
    RolesGuard,
    PermissionsGuard,
    TenantGuard,
  ],
})
export class EquiposModule {}
