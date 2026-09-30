import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TicketsModule } from '../tickets/tickets.module';
import { InsumosModule } from '../insumos/insumos.module';

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

import {
  MODELO_EQUIPO_REPOSITORY,
  IModeloEquipoRepository,
} from '../insumos/domain/ports/i-modelo-equipo.repository';
import { INSUMO_REPOSITORY, IInsumoRepository } from '../insumos/domain/ports/i-insumo.repository';
import {
  FAMILIA_INSUMO_REPOSITORY,
  IFamiliaInsumoRepository,
} from '../insumos/domain/ports/i-familia-insumo.repository';
import { RegistrarSalidaInsumoUseCase } from '../insumos/application/use-cases/registrar-salida-insumo.use-case';
import { RegistrarEntradaInsumoUseCase } from '../insumos/application/use-cases/registrar-entrada-insumo.use-case';

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
  TICKET_SOPORTE_REPOSITORY,
  ITicketSoporteRepository,
} from './domain/ports/i-ticket-soporte.repository';
import { PrismaTicketSoporteRepository } from './infrastructure/persistence/prisma/prisma-ticket-soporte.repository';

import { CrearEquipoUseCase } from './application/use-cases/crear-equipo.use-case';
import { EditarEquipoUseCase } from './application/use-cases/editar-equipo.use-case';
import { ObtenerEquipoUseCase } from './application/use-cases/obtener-equipo.use-case';
import { ListarEquiposUseCase } from './application/use-cases/listar-equipos.use-case';
import { EliminarEquipoUseCase } from './application/use-cases/eliminar-equipo.use-case';
import { AgregarComponenteUseCase } from './application/use-cases/agregar-componente.use-case';
import { InstalarComponenteDesdeDepositoUseCase } from './application/use-cases/instalar-componente-desde-deposito.use-case';
import { EditarComponenteUseCase } from './application/use-cases/editar-componente.use-case';
import { RetirarComponenteUseCase } from './application/use-cases/retirar-componente.use-case';
import { ReactivarComponenteUseCase } from './application/use-cases/reactivar-componente.use-case';
import { CrearTicketSoporteUseCase } from './application/use-cases/crear-ticket-soporte.use-case';
import { RegistrarSolucionUseCase } from './application/use-cases/registrar-solucion.use-case';
import { ObtenerEquipoDeTicketUseCase } from './application/use-cases/obtener-equipo-de-ticket.use-case';
import { ExportarEquiposUseCase } from './application/use-cases/exportar-equipos.use-case';

import { EquiposController } from './interface/controllers/equipos.controller';
import { SoporteController } from './interface/controllers/soporte.controller';

/**
 * EquiposModule — módulo NestJS del dominio "equipos" (Fase 3, F3-Q1..Q5,
 * F3-M1).
 *
 * Inventario de equipos IT (`equipos_informaticos`), componentes
 * (`componentes_equipo`, referencian el catálogo MASTER de tipos de
 * componente por `codigo` — PR4b) y el satélite `ticket_soporte` 1:0..1 de
 * `Ticket` (con vínculo OPCIONAL a un equipo).
 *
 * Wiring (PR10-PR13, screaming module hexagonal — domain/ → application/ →
 * infrastructure/ → interface/):
 * - Importa `TicketsModule` para reusar sus providers EXPORTADOS
 *   (TICKET_REPOSITORY, OPERACION_TICKET_REPOSITORY, ESTADO_REPOSITORY,
 *   TIPO_TICKET_REPOSITORY, TIPO_OPERACION_REPOSITORY,
 *   USUARIO_MASTER_CHECKER, CICLO_CLIENTE_REPOSITORY) — NO se reimplementan,
 *   se inyectan por token (mismo patrón que `ComprasModule`/`ReparacionesModule`).
 * - `NumeradorTicket`/`ResolverCicloActivoParaCreacion` son clases planas
 *   (sin `@Injectable`) — se resuelven vía `useFactory`, igual que en
 *   `ComprasModule`/`ReparacionesModule`.
 * - Importa `InsumosModule` para `MODELO_EQUIPO_REPOSITORY`:
 *   `CrearEquipoUseCase`/`EditarEquipoUseCase` validan `modeloEquipoId` contra
 *   el catálogo `modelos_equipo` (que existe, que está habilitado) antes de
 *   asignarlo. La dirección es la correcta y NO hay ciclo: `InsumosModule`
 *   sólo importa `AuthModule` — `equipos_informaticos.modelo_equipo_id` es
 *   consumidor del catálogo, no su dueño. WU-3 (sdd/repuestos-vinculo-componente)
 *   suma `INSUMO_REPOSITORY`/`FAMILIA_INSUMO_REPOSITORY` por el mismo motivo:
 *   `AgregarComponenteUseCase` resuelve el repuesto vinculado (`insumoId`) y
 *   la familia de la que deriva `tipoComponenteCodigo`. WU-4
 *   (sdd/repuestos-instalar-desde-deposito, issue #153) suma
 *   `RegistrarSalidaInsumoUseCase` (exportado por `InsumosModule`, nunca su
 *   puerto de movimientos) para que `InstalarComponenteDesdeDepositoUseCase`
 *   registre la salida de stock y cree el componente en UNA sola transacción.
 *   sdd/repuestos-autoridad-catalogo suma `INSUMO_REPOSITORY` también al
 *   `inject` de `ObtenerEquipoUseCase`: el detalle resuelve el tipo de un
 *   componente VINCULADO por el catálogo del tenant, no por MASTER (ver
 *   nota de abajo).
 * - `TENANT_TX_RUNNER` se inyecta desde `SharedModule` (`@Global`).
 * - `EquiposController` expone el inventario + componentes; `SoporteController` expone la creación de tickets de soporte y
 *   el registro de solución.
 * - sdd/catalogo-unico-componentes: el checker MASTER de tipos de componente y
 *   `GET /equipos/tipos-componente` se retiraron; el tipo de un componente se
 *   resuelve solo por el catálogo del tenant (`INSUMO_REPOSITORY`).
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
  // descubierto por sdd/beta-frontend B6, T6.2) — TicketsModule no re-exporta
  // AuthModule, así que los guards de EquiposController/SoporteController lo
  // necesitan importado acá explícitamente.
  imports: [AuthModule, TicketsModule, InsumosModule],
  controllers: [EquiposController, SoporteController],
  providers: [
    { provide: EQUIPO_INFORMATICO_REPOSITORY, useClass: PrismaEquipoInformaticoRepository },
    { provide: COMPONENTE_EQUIPO_REPOSITORY, useClass: PrismaComponenteEquipoRepository },
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
        txRunner: ITenantTransactionRunner,
        modeloEquipoRepo: IModeloEquipoRepository,
      ) => new CrearEquipoUseCase(equipoRepo, txRunner, modeloEquipoRepo),
      inject: [EQUIPO_INFORMATICO_REPOSITORY, TENANT_TX_RUNNER, MODELO_EQUIPO_REPOSITORY],
    },
    {
      provide: EditarEquipoUseCase,
      useFactory: (
        equipoRepo: IEquipoInformaticoRepository,
        txRunner: ITenantTransactionRunner,
        modeloEquipoRepo: IModeloEquipoRepository,
      ) => new EditarEquipoUseCase(equipoRepo, txRunner, modeloEquipoRepo),
      inject: [EQUIPO_INFORMATICO_REPOSITORY, TENANT_TX_RUNNER, MODELO_EQUIPO_REPOSITORY],
    },
    {
      // sdd/repuestos-autoridad-catalogo (ADR-3): suma INSUMO_REPOSITORY (de
      // InsumosModule, ya importado más arriba) para que el detalle resuelva
      // el tipo de un componente VINCULADO por el catálogo del tenant
      // (`findFamiliasDeInsumos`), en vez de MASTER — mismo motivo y misma
      // dirección de dependencia que WU-3 suma a `AgregarComponenteUseCase`.
      provide: ObtenerEquipoUseCase,
      useFactory: (
        equipoRepo: IEquipoInformaticoRepository,
        componenteRepo: IComponenteEquipoRepository,
        insumoRepo: IInsumoRepository,
      ) => new ObtenerEquipoUseCase(equipoRepo, componenteRepo, insumoRepo),
      inject: [EQUIPO_INFORMATICO_REPOSITORY, COMPONENTE_EQUIPO_REPOSITORY, INSUMO_REPOSITORY],
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
      // WU-3 (sdd/repuestos-vinculo-componente): agrega INSUMO_REPOSITORY y
      // FAMILIA_INSUMO_REPOSITORY (ambos de InsumosModule, ya importado más
      // arriba para MODELO_EQUIPO_REPOSITORY — misma dirección de
      // dependencia, sin ciclo) para resolver el repuesto vinculado y
      // derivar `tipoComponenteCodigo` de su familia.
      provide: AgregarComponenteUseCase,
      useFactory: (
        equipoRepo: IEquipoInformaticoRepository,
        componenteRepo: IComponenteEquipoRepository,
        insumoRepo: IInsumoRepository,
        familiaInsumoRepo: IFamiliaInsumoRepository,
      ) => new AgregarComponenteUseCase(equipoRepo, componenteRepo, insumoRepo, familiaInsumoRepo),
      inject: [
        EQUIPO_INFORMATICO_REPOSITORY,
        COMPONENTE_EQUIPO_REPOSITORY,
        INSUMO_REPOSITORY,
        FAMILIA_INSUMO_REPOSITORY,
      ],
    },
    {
      // WU-4 (sdd/repuestos-instalar-desde-deposito, issue #153): compone
      // `AgregarComponenteUseCase` (reusado completo — no se duplica ninguna
      // validación del WU-3) y `RegistrarSalidaInsumoUseCase` (de
      // `InsumosModule`, exportado por el mismo motivo que
      // `RegistrarEntradaInsumoUseCase`) dentro de UNA transacción propia.
      provide: InstalarComponenteDesdeDepositoUseCase,
      useFactory: (
        txRunner: ITenantTransactionRunner,
        agregarComponenteUseCase: AgregarComponenteUseCase,
        registrarSalidaInsumoUseCase: RegistrarSalidaInsumoUseCase,
        componenteRepo: IComponenteEquipoRepository,
      ) =>
        new InstalarComponenteDesdeDepositoUseCase(
          txRunner,
          agregarComponenteUseCase,
          registrarSalidaInsumoUseCase,
          componenteRepo,
        ),
      inject: [
        TENANT_TX_RUNNER,
        AgregarComponenteUseCase,
        RegistrarSalidaInsumoUseCase,
        COMPONENTE_EQUIPO_REPOSITORY,
      ],
    },
    {
      provide: EditarComponenteUseCase,
      useFactory: (componenteRepo: IComponenteEquipoRepository) =>
        new EditarComponenteUseCase(componenteRepo),
      inject: [COMPONENTE_EQUIPO_REPOSITORY],
    },
    {
      // sdd/stock-usado-componentes (ADR-4): retiro atomico. Compone la ENTRADA
      // de devolucion (`registrarDevolucionDeComponente`, sin exposicion HTTP)
      // con la marca condicional de retiro en una transaccion propia.
      provide: RetirarComponenteUseCase,
      useFactory: (
        txRunner: ITenantTransactionRunner,
        componenteRepo: IComponenteEquipoRepository,
        registrarEntrada: RegistrarEntradaInsumoUseCase,
      ) => new RetirarComponenteUseCase(txRunner, componenteRepo, registrarEntrada),
      inject: [TENANT_TX_RUNNER, COMPONENTE_EQUIPO_REPOSITORY, RegistrarEntradaInsumoUseCase],
    },
    {
      provide: ReactivarComponenteUseCase,
      useFactory: (componenteRepo: IComponenteEquipoRepository) =>
        new ReactivarComponenteUseCase(componenteRepo),
      inject: [COMPONENTE_EQUIPO_REPOSITORY],
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
        eventPublisher: IDomainEventPublisher,
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
          eventPublisher,
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
        DOMAIN_EVENT_PUBLISHER,
        TENANT_TX_RUNNER,
      ],
    },
    {
      provide: RegistrarSolucionUseCase,
      useFactory: (ticketSoporteRepo: ITicketSoporteRepository) =>
        new RegistrarSolucionUseCase(ticketSoporteRepo),
      inject: [TICKET_SOPORTE_REPOSITORY],
    },
    {
      provide: ObtenerEquipoDeTicketUseCase,
      useFactory: (
        ticketSoporteRepo: ITicketSoporteRepository,
        equipoRepo: IEquipoInformaticoRepository,
      ) => new ObtenerEquipoDeTicketUseCase(ticketSoporteRepo, equipoRepo),
      inject: [TICKET_SOPORTE_REPOSITORY, EQUIPO_INFORMATICO_REPOSITORY],
    },
    {
      // Compone `ListarEquiposUseCase` (design D4, sdd/exportar-listados-csv)
      // — NO inyecta EQUIPO_INFORMATICO_REPOSITORY directamente.
      provide: ExportarEquiposUseCase,
      useFactory: (listarEquiposUseCase: ListarEquiposUseCase) =>
        new ExportarEquiposUseCase(listarEquiposUseCase),
      inject: [ListarEquiposUseCase],
    },
  ],
  exports: [EQUIPO_INFORMATICO_REPOSITORY, COMPONENTE_EQUIPO_REPOSITORY, TICKET_SOPORTE_REPOSITORY],
})
export class EquiposModule {}
