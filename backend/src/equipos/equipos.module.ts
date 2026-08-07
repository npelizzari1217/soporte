import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TicketsModule } from '../tickets/tickets.module';
import { ReparacionesModule } from '../reparaciones/reparaciones.module';

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
  UBICACION_REPOSITORY,
  IUbicacionRepository,
} from '../reparaciones/domain/ports/i-ubicacion.repository';

import {
  EQUIPO_INFORMATICO_REPOSITORY,
  IEquipoInformaticoRepository,
} from './domain/ports/i-equipo-informatico.repository';
import { PrismaEquipoInformaticoRepository } from './infrastructure/persistence/prisma/prisma-equipo-informatico.repository';
import {
  COMPONENTE_EQUIPO_REPOSITORY,
  IComponenteEquipoRepository,
} from './domain/ports/i-componente-equipo.repository';
import { PrismaComponenteEquipoRepository } from './infrastructure/persistence/prisma/prisma-componente-equipo.repository';
import {
  TIPO_COMPONENTE_REPOSITORY,
  ITipoComponenteRepository,
} from './domain/ports/i-tipo-componente.repository';
import { PrismaTipoComponenteRepository } from './infrastructure/persistence/prisma/prisma-tipo-componente.repository';
import {
  TICKET_SOPORTE_REPOSITORY,
  ITicketSoporteRepository,
} from './domain/ports/i-ticket-soporte.repository';
import { PrismaTicketSoporteRepository } from './infrastructure/persistence/prisma/prisma-ticket-soporte.repository';

import { CrearEquipoUseCase } from './application/use-cases/crear-equipo.use-case';
import { EditarEquipoUseCase } from './application/use-cases/editar-equipo.use-case';
import { ObtenerEquipoUseCase } from './application/use-cases/obtener-equipo.use-case';
import { ListarEquiposUseCase } from './application/use-cases/listar-equipos.use-case';
import { EliminarEquipoUseCase } from './application/use-cases/eliminar-equipo.use-case';
import { AsignarEquipoUseCase } from './application/use-cases/asignar-equipo.use-case';
import { AgregarComponenteUseCase } from './application/use-cases/agregar-componente.use-case';
import { EliminarComponenteUseCase } from './application/use-cases/eliminar-componente.use-case';
import { ListarTiposComponenteUseCase } from './application/use-cases/listar-tipos-componente.use-case';
import { CrearTicketSoporteUseCase } from './application/use-cases/crear-ticket-soporte.use-case';
import { RegistrarSolucionUseCase } from './application/use-cases/registrar-solucion.use-case';

import { EquiposController } from './interface/controllers/equipos.controller';
import { SoporteController } from './interface/controllers/soporte.controller';

/**
 * EquiposModule — módulo NestJS del dominio "equipos" (Fase 3, F3-Q1..Q5,
 * F3-M1).
 *
 * Inventario de equipos IT (`equipos_informaticos`), componentes
 * (`componentes_equipo`), catálogo read-only de tipos de componente
 * (`tipos_componente`, PR1) y el satélite `ticket_soporte` 1:0..1 de
 * `Ticket` (con vínculo OPCIONAL a un equipo).
 *
 * Wiring (PR10-PR13, screaming module hexagonal — domain/ → application/ →
 * infrastructure/ → interface/):
 * - Importa `TicketsModule` para reusar sus providers EXPORTADOS
 *   (TICKET_REPOSITORY, OPERACION_TICKET_REPOSITORY, ESTADO_REPOSITORY,
 *   TIPO_TICKET_REPOSITORY, TIPO_OPERACION_REPOSITORY,
 *   USUARIO_MASTER_CHECKER, CICLO_CLIENTE_REPOSITORY) — NO se reimplementan,
 *   se inyectan por token (mismo patrón que `ComprasModule`/`ReparacionesModule`).
 * - Importa `ReparacionesModule` para reusar `UBICACION_REPOSITORY`
 *   (catálogo tenant-wide de ubicaciones, compartido entre Edilicia y
 *   Equipos — la validación de `ubicacionId` de `crear/editar-equipo` NO
 *   duplica la entidad/puerto `Ubicacion`).
 * - `NumeradorTicket`/`ResolverCicloActivoParaCreacion` son clases planas
 *   (sin `@Injectable`) — se resuelven vía `useFactory`, igual que en
 *   `ComprasModule`/`ReparacionesModule`.
 * - `TENANT_TX_RUNNER` se inyecta desde `SharedModule` (`@Global`).
 * - `EquiposController` expone el inventario + componentes + catálogo de
 *   tipos; `SoporteController` expone la creación de tickets de soporte y
 *   el registro de solución.
 *
 * FITNESS RULE: PrismaService y @prisma/client solo pueden importarse desde
 * infrastructure/ (ver backend/eslint.config.js).
 *
 * Nota MANTENIMIENTO (F3-M1, ADR-10): NO hay entidad/repo/controller propio
 * — el tipo ya está sembrado y el `Ticket` base de `TicketsModule` lo
 * soporta sin cambios (verificado por
 * `equipos/mantenimiento.integration.spec.ts`, T13.5/T13.6).
 */
@Module({
  // AuthModule: ver comentario equivalente en compras.module.ts (mismo gap,
  // descubierto por sdd/beta-frontend B6, T6.2) — ni TicketsModule ni
  // ReparacionesModule re-exportan AuthModule, así que los guards de
  // EquiposController/SoporteController lo necesitan importado acá explícitamente.
  imports: [AuthModule, TicketsModule, ReparacionesModule],
  controllers: [EquiposController, SoporteController],
  providers: [
    { provide: EQUIPO_INFORMATICO_REPOSITORY, useClass: PrismaEquipoInformaticoRepository },
    { provide: COMPONENTE_EQUIPO_REPOSITORY, useClass: PrismaComponenteEquipoRepository },
    { provide: TIPO_COMPONENTE_REPOSITORY, useClass: PrismaTipoComponenteRepository },
    { provide: TICKET_SOPORTE_REPOSITORY, useClass: PrismaTicketSoporteRepository },

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
      provide: CrearEquipoUseCase,
      useFactory: (
        equipoRepo: IEquipoInformaticoRepository,
        ubicacionRepo: IUbicacionRepository,
        txRunner: ITenantTransactionRunner,
      ) => new CrearEquipoUseCase(equipoRepo, ubicacionRepo, txRunner),
      inject: [EQUIPO_INFORMATICO_REPOSITORY, UBICACION_REPOSITORY, TENANT_TX_RUNNER],
    },
    {
      provide: EditarEquipoUseCase,
      useFactory: (
        equipoRepo: IEquipoInformaticoRepository,
        ubicacionRepo: IUbicacionRepository,
        txRunner: ITenantTransactionRunner,
      ) => new EditarEquipoUseCase(equipoRepo, ubicacionRepo, txRunner),
      inject: [EQUIPO_INFORMATICO_REPOSITORY, UBICACION_REPOSITORY, TENANT_TX_RUNNER],
    },
    {
      provide: ObtenerEquipoUseCase,
      useFactory: (
        equipoRepo: IEquipoInformaticoRepository,
        componenteRepo: IComponenteEquipoRepository,
      ) => new ObtenerEquipoUseCase(equipoRepo, componenteRepo),
      inject: [EQUIPO_INFORMATICO_REPOSITORY, COMPONENTE_EQUIPO_REPOSITORY],
    },
    {
      provide: ListarEquiposUseCase,
      useFactory: (equipoRepo: IEquipoInformaticoRepository) =>
        new ListarEquiposUseCase(equipoRepo),
      inject: [EQUIPO_INFORMATICO_REPOSITORY],
    },
    {
      provide: EliminarEquipoUseCase,
      useFactory: (equipoRepo: IEquipoInformaticoRepository) =>
        new EliminarEquipoUseCase(equipoRepo),
      inject: [EQUIPO_INFORMATICO_REPOSITORY],
    },
    {
      provide: AsignarEquipoUseCase,
      useFactory: (
        equipoRepo: IEquipoInformaticoRepository,
        usuarioMasterChecker: IUsuarioMasterChecker,
      ) => new AsignarEquipoUseCase(equipoRepo, usuarioMasterChecker),
      inject: [EQUIPO_INFORMATICO_REPOSITORY, USUARIO_MASTER_CHECKER],
    },
    {
      provide: AgregarComponenteUseCase,
      useFactory: (
        equipoRepo: IEquipoInformaticoRepository,
        tipoComponenteRepo: ITipoComponenteRepository,
        componenteRepo: IComponenteEquipoRepository,
      ) => new AgregarComponenteUseCase(equipoRepo, tipoComponenteRepo, componenteRepo),
      inject: [
        EQUIPO_INFORMATICO_REPOSITORY,
        TIPO_COMPONENTE_REPOSITORY,
        COMPONENTE_EQUIPO_REPOSITORY,
      ],
    },
    {
      provide: EliminarComponenteUseCase,
      useFactory: (componenteRepo: IComponenteEquipoRepository) =>
        new EliminarComponenteUseCase(componenteRepo),
      inject: [COMPONENTE_EQUIPO_REPOSITORY],
    },
    {
      provide: ListarTiposComponenteUseCase,
      useFactory: (tipoComponenteRepo: ITipoComponenteRepository) =>
        new ListarTiposComponenteUseCase(tipoComponenteRepo),
      inject: [TIPO_COMPONENTE_REPOSITORY],
    },
    {
      provide: CrearTicketSoporteUseCase,
      useFactory: (
        ticketRepo: ITicketRepository,
        operacionRepo: IOperacionTicketRepository,
        ticketSoporteRepo: ITicketSoporteRepository,
        estadoRepo: IEstadoRepository,
        tipoTicketRepo: ITipoTicketRepository,
        tipoOperacionRepo: ITipoOperacionRepository,
        usuarioMasterChecker: IUsuarioMasterChecker,
        numerador: NumeradorTicket,
        resolverCicloActivo: ResolverCicloActivoParaCreacion,
        equipoRepo: IEquipoInformaticoRepository,
        txRunner: ITenantTransactionRunner,
      ) =>
        new CrearTicketSoporteUseCase(
          ticketRepo,
          operacionRepo,
          ticketSoporteRepo,
          estadoRepo,
          tipoTicketRepo,
          tipoOperacionRepo,
          usuarioMasterChecker,
          numerador,
          resolverCicloActivo,
          equipoRepo,
          txRunner,
        ),
      inject: [
        TICKET_REPOSITORY,
        OPERACION_TICKET_REPOSITORY,
        TICKET_SOPORTE_REPOSITORY,
        ESTADO_REPOSITORY,
        TIPO_TICKET_REPOSITORY,
        TIPO_OPERACION_REPOSITORY,
        USUARIO_MASTER_CHECKER,
        NumeradorTicket,
        ResolverCicloActivoParaCreacion,
        EQUIPO_INFORMATICO_REPOSITORY,
        TENANT_TX_RUNNER,
      ],
    },
    {
      provide: RegistrarSolucionUseCase,
      useFactory: (ticketSoporteRepo: ITicketSoporteRepository) =>
        new RegistrarSolucionUseCase(ticketSoporteRepo),
      inject: [TICKET_SOPORTE_REPOSITORY],
    },
  ],
  exports: [
    EQUIPO_INFORMATICO_REPOSITORY,
    COMPONENTE_EQUIPO_REPOSITORY,
    TIPO_COMPONENTE_REPOSITORY,
    TICKET_SOPORTE_REPOSITORY,
  ],
})
export class EquiposModule {}
