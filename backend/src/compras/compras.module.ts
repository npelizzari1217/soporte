import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TicketsModule } from '../tickets/tickets.module';
import { SectoresModule } from '../sectores/sectores.module';
import { InsumosModule } from '../insumos/insumos.module';

import {
  ITenantTransactionRunner,
  TENANT_TX_RUNNER,
} from '../shared/infrastructure/persistence/tenant-transaction-runner';
import {
  CICLO_CLIENTE_REPOSITORY,
  ICicloClienteRepository,
} from '../tickets/domain/ports/i-ciclo-cliente.repository';
import { SECTOR_REPOSITORY, ISectorRepository } from '../sectores/domain/ports/i-sector.repository';

import { COMPRA_REPOSITORY, ICompraRepository } from './domain/ports/i-compra.repository';
import { PrismaCompraRepository } from './infrastructure/persistence/prisma/prisma-compra.repository';
import {
  OPERACION_COMPRA_REPOSITORY,
  IOperacionCompraRepository,
} from './domain/ports/i-operacion-compra.repository';
import { PrismaOperacionCompraRepository } from './infrastructure/persistence/prisma/prisma-operacion-compra.repository';

import { NumeradorCompra } from './domain/services/numerador-compra';
import { RegistrarOperacionCompra } from './application/services/registrar-operacion-compra';
import { ResolverCicloActivoCompra } from './application/services/resolver-ciclo-activo-compra.service';

import { CrearCompraUseCase } from './application/use-cases/crear-compra.use-case';
import { AgregarItemCompraUseCase } from './application/use-cases/agregar-item-compra.use-case';
import { EditarCompraUseCase } from './application/use-cases/editar-compra.use-case';
import { EditarItemCompraUseCase } from './application/use-cases/editar-item-compra.use-case';
import { EliminarItemCompraUseCase } from './application/use-cases/eliminar-item-compra.use-case';
import { AprobarItemCompraUseCase } from './application/use-cases/aprobar-item-compra.use-case';
import { RechazarItemCompraUseCase } from './application/use-cases/rechazar-item-compra.use-case';
import { RegistrarOrdenDeItemUseCase } from './application/use-cases/registrar-orden-de-item.use-case';
import { RegistrarRecepcionDeItemUseCase } from './application/use-cases/registrar-recepcion-de-item.use-case';
import { RegistrarEntregaDeItemUseCase } from './application/use-cases/registrar-entrega-de-item.use-case';
import { EditarFechaEtapaDeItemUseCase } from './application/use-cases/editar-fecha-etapa-de-item.use-case';
import { CerrarItemConFaltanteUseCase } from './application/use-cases/cerrar-item-con-faltante.use-case';
import { CancelarCompraUseCase } from './application/use-cases/cancelar-compra.use-case';
import { ListarComprasUseCase } from './application/use-cases/listar-compras.use-case';
import { ExportarComprasUseCase } from './application/use-cases/exportar-compras.use-case';
import { ObtenerCompraUseCase } from './application/use-cases/obtener-compra.use-case';
import { ListarOperacionesCompraUseCase } from './application/use-cases/listar-operaciones-compra.use-case';

import { RegistrarEntradaInsumoUseCase } from '../insumos/application/use-cases/registrar-entrada-insumo.use-case';
import { INSUMO_REPOSITORY, IInsumoRepository } from '../insumos/domain/ports/i-insumo.repository';

import { ComprasController } from './interface/controllers/compras.controller';

/**
 * ComprasModule — wiring real del dominio `compras/` (sdd/redisenio-modulo-compras,
 * PR-22, reemplaza el placeholder `@Module({})` de PR-1).
 *
 * Registra los casos de uso del módulo (mutadores + consultas), los 2 repos
 * Prisma, `NumeradorCompra` (ADR-C5) y `RegistrarOperacionCompra` (ADR-C4).
 * Sin conteos escritos a mano: los de este header quedaron desactualizados
 * dos veces, y la lista de `provide:` de abajo ya es la fuente de verdad.
 *
 * **Regla estructural "tx ⇒ bitácora" (ADR-C4, capa 2 de la defensa contra
 * el olvido)**: TODO provider de este módulo cuyo `inject[]` contenga
 * `TENANT_TX_RUNNER` (es decir, todo caso de uso que abre transacción) DEBE
 * también tener `RegistrarOperacionCompra` en su `inject[]`. Esta regla se
 * verifica estructuralmente en `compras.module.spec.ts` leyendo
 * `Reflect.getMetadata('providers', ComprasModule)` — si un PR futuro agrega
 * un mutador nuevo sin cablear la bitácora, ese test falla SOLO, sin que
 * nadie lo edite. Las 3 consultas (`ListarComprasUseCase`/`ObtenerCompraUseCase`/
 * `ListarOperacionesCompraUseCase`) NO reciben `TENANT_TX_RUNNER` — son
 * lecturas puras (§4.9/§4.10), y por eso quedan fuera del predicado sin
 * necesitar una excepción explícita.
 *
 * Wiring (mismo patrón que `equipos.module.ts:130-135`, verificado):
 * - Importa `TicketsModule` para reusar `CICLO_CLIENTE_REPOSITORY` (la MISMA
 *   tabla `CicloCliente` compartida, no una copia) — `ResolverCicloActivoCompra`
 *   (propio de `compras/`, NO el de `tickets/`: ver su JSDoc para el
 *   porqué) se resuelve acá vía `useFactory`, mismo patrón de
 *   `useFactory` que usa `EquiposModule` para `ResolverCicloActivoParaCreacion`.
 * - `AuthModule`: `ComprasController` usa `JwtAuthGuard`/`TenantGuard`/
 *   `PermissionsGuard`/`ModulosGuard` (PR-21) — `TicketsModule` no re-exporta
 *   `AuthModule`, así que se importa acá explícitamente (mismo gap que
 *   `EquiposModule`/`ReparacionesModule`).
 * - `NumeradorCompra`/`RegistrarOperacionCompra` son clases planas (sin
 *   `@Injectable`) — se resuelven vía `useFactory`, igual que
 *   `NumeradorTicket`/`ResolverCicloActivoParaCreacion` en `EquiposModule`.
 * - `TENANT_TX_RUNNER` se inyecta desde `SharedModule` (`@Global`).
 * - `InsumosModule` (insumos-entrega-3, unidades 5, 6 y 7): exporta
 *   `RegistrarEntradaInsumoUseCase`, que `RegistrarRecepcionDeItemUseCase`
 *   invoca DENTRO de su transacción para que recibir una compra sume el stock
 *   solo, e `INSUMO_REPOSITORY`, con el que el alta y la edición del ítem
 *   verifican que el `insumoId` declarado exista en el catálogo. Es el puerto
 *   de LECTURA del catálogo, no el de la bitácora de existencias
 *   (`MOVIMIENTO_INSUMO_REPOSITORY`, que `InsumosModule` no exporta a
 *   propósito): compras nunca escribe un movimiento salvo a través del caso de
 *   uso, que lleva sus guards puestos. La flecha va en este sentido y nunca al
 *   revés — `insumos` no importa nada de `compras`, porque esa arista cerraría
 *   un ciclo entre los dos módulos.
 *
 * FITNESS RULE: PrismaService y `@prisma/client` solo pueden importarse
 * desde `infrastructure/` (ver `backend/eslint.config.js`) — este módulo
 * inyecta los repos por token, nunca importa Prisma directo.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec. Ref design: sección CASOS DE
 * USO, ADR-C2, ADR-C4, ADR-C5. Ref tasks: PR-22 (cierra la FASE E).
 */
@Module({
  imports: [AuthModule, TicketsModule, SectoresModule, InsumosModule],
  controllers: [ComprasController],
  providers: [
    { provide: COMPRA_REPOSITORY, useClass: PrismaCompraRepository },
    { provide: OPERACION_COMPRA_REPOSITORY, useClass: PrismaOperacionCompraRepository },

    {
      provide: NumeradorCompra,
      useFactory: (compraRepo: ICompraRepository) => new NumeradorCompra(compraRepo),
      inject: [COMPRA_REPOSITORY],
    },
    {
      provide: ResolverCicloActivoCompra,
      useFactory: (cicloRepo: ICicloClienteRepository) => new ResolverCicloActivoCompra(cicloRepo),
      inject: [CICLO_CLIENTE_REPOSITORY],
    },
    {
      provide: RegistrarOperacionCompra,
      useFactory: (operacionRepo: IOperacionCompraRepository) =>
        new RegistrarOperacionCompra(operacionRepo),
      inject: [OPERACION_COMPRA_REPOSITORY],
    },

    // ─── Mutadores — TODOS inyectan TENANT_TX_RUNNER + RegistrarOperacionCompra ───
    {
      provide: CrearCompraUseCase,
      useFactory: (
        compraRepo: ICompraRepository,
        numerador: NumeradorCompra,
        resolverCicloActivo: ResolverCicloActivoCompra,
        sectorRepo: ISectorRepository,
        registrarOperacion: RegistrarOperacionCompra,
        txRunner: ITenantTransactionRunner,
      ) =>
        new CrearCompraUseCase(
          compraRepo,
          numerador,
          resolverCicloActivo,
          sectorRepo,
          registrarOperacion,
          txRunner,
        ),
      // Fix post-verify W6: agrega SECTOR_REPOSITORY (importado de
      // SectoresModule, WU-09) para validar `sectorId` ANTES del INSERT.
      inject: [
        COMPRA_REPOSITORY,
        NumeradorCompra,
        ResolverCicloActivoCompra,
        SECTOR_REPOSITORY,
        RegistrarOperacionCompra,
        TENANT_TX_RUNNER,
      ],
    },
    {
      // Inyecta INSUMO_REPOSITORY (exportado por InsumosModule) con el MISMO
      // criterio con el que `CrearCompraUseCase` inyecta SECTOR_REPOSITORY
      // (fix W6): un `insumoId` inexistente tiene que dar un 422 que lo nombre,
      // no el 409 genérico con el que la FK lo rechaza en el INSERT.
      provide: AgregarItemCompraUseCase,
      useFactory: (
        compraRepo: ICompraRepository,
        insumoRepo: IInsumoRepository,
        registrarOperacion: RegistrarOperacionCompra,
        txRunner: ITenantTransactionRunner,
      ) => new AgregarItemCompraUseCase(compraRepo, insumoRepo, registrarOperacion, txRunner),
      inject: [COMPRA_REPOSITORY, INSUMO_REPOSITORY, RegistrarOperacionCompra, TENANT_TX_RUNNER],
    },
    {
      // Inyecta SECTOR_REPOSITORY por la misma razón que `CrearCompraUseCase`
      // (fix post-verify W6): valida que el `sectorId` exista ANTES del
      // UPDATE. Sin esto, el PATCH de cabecera reabriría el agujero que W6
      // cerró en el alta.
      provide: EditarCompraUseCase,
      useFactory: (
        compraRepo: ICompraRepository,
        sectorRepo: ISectorRepository,
        registrarOperacion: RegistrarOperacionCompra,
        txRunner: ITenantTransactionRunner,
      ) => new EditarCompraUseCase(compraRepo, sectorRepo, registrarOperacion, txRunner),
      inject: [COMPRA_REPOSITORY, SECTOR_REPOSITORY, RegistrarOperacionCompra, TENANT_TX_RUNNER],
    },
    {
      // Mismo criterio que `AgregarItemCompraUseCase`: sin esto, el PATCH del
      // ítem reabriría por la puerta de la edición el agujero que el alta cierra.
      provide: EditarItemCompraUseCase,
      useFactory: (
        compraRepo: ICompraRepository,
        insumoRepo: IInsumoRepository,
        registrarOperacion: RegistrarOperacionCompra,
        txRunner: ITenantTransactionRunner,
      ) => new EditarItemCompraUseCase(compraRepo, insumoRepo, registrarOperacion, txRunner),
      inject: [COMPRA_REPOSITORY, INSUMO_REPOSITORY, RegistrarOperacionCompra, TENANT_TX_RUNNER],
    },
    {
      provide: EliminarItemCompraUseCase,
      useFactory: (
        compraRepo: ICompraRepository,
        registrarOperacion: RegistrarOperacionCompra,
        txRunner: ITenantTransactionRunner,
      ) => new EliminarItemCompraUseCase(compraRepo, registrarOperacion, txRunner),
      inject: [COMPRA_REPOSITORY, RegistrarOperacionCompra, TENANT_TX_RUNNER],
    },
    {
      provide: AprobarItemCompraUseCase,
      useFactory: (
        compraRepo: ICompraRepository,
        registrarOperacionCompra: RegistrarOperacionCompra,
        txRunner: ITenantTransactionRunner,
      ) => new AprobarItemCompraUseCase(compraRepo, registrarOperacionCompra, txRunner),
      inject: [COMPRA_REPOSITORY, RegistrarOperacionCompra, TENANT_TX_RUNNER],
    },
    {
      provide: RechazarItemCompraUseCase,
      useFactory: (
        compraRepo: ICompraRepository,
        registrarOperacionCompra: RegistrarOperacionCompra,
        txRunner: ITenantTransactionRunner,
      ) => new RechazarItemCompraUseCase(compraRepo, registrarOperacionCompra, txRunner),
      inject: [COMPRA_REPOSITORY, RegistrarOperacionCompra, TENANT_TX_RUNNER],
    },
    {
      provide: RegistrarOrdenDeItemUseCase,
      useFactory: (
        compraRepo: ICompraRepository,
        registrarOperacion: RegistrarOperacionCompra,
        txRunner: ITenantTransactionRunner,
      ) => new RegistrarOrdenDeItemUseCase(compraRepo, registrarOperacion, txRunner),
      inject: [COMPRA_REPOSITORY, RegistrarOperacionCompra, TENANT_TX_RUNNER],
    },
    {
      // La recepción es la etapa que hace entrar mercadería al depósito, así
      // que es el único punto del circuito de compras que tiene stock que
      // ASENTAR. Los otros consumidores de `InsumosModule` de este archivo solo
      // LEEN el catálogo para validar el insumo declarado; este escribe la
      // bitácora de existencias, y por eso recibe el caso de uso de la entrada
      // en vez del puerto del catálogo.
      provide: RegistrarRecepcionDeItemUseCase,
      useFactory: (
        compraRepo: ICompraRepository,
        registrarOperacion: RegistrarOperacionCompra,
        txRunner: ITenantTransactionRunner,
        registrarEntradaInsumo: RegistrarEntradaInsumoUseCase,
      ) =>
        new RegistrarRecepcionDeItemUseCase(
          compraRepo,
          registrarOperacion,
          txRunner,
          registrarEntradaInsumo,
        ),
      inject: [
        COMPRA_REPOSITORY,
        RegistrarOperacionCompra,
        TENANT_TX_RUNNER,
        RegistrarEntradaInsumoUseCase,
      ],
    },
    {
      provide: RegistrarEntregaDeItemUseCase,
      useFactory: (
        compraRepo: ICompraRepository,
        registrarOperacion: RegistrarOperacionCompra,
        txRunner: ITenantTransactionRunner,
      ) => new RegistrarEntregaDeItemUseCase(compraRepo, registrarOperacion, txRunner),
      inject: [COMPRA_REPOSITORY, RegistrarOperacionCompra, TENANT_TX_RUNNER],
    },
    {
      provide: EditarFechaEtapaDeItemUseCase,
      useFactory: (
        compraRepo: ICompraRepository,
        registrarOperacion: RegistrarOperacionCompra,
        txRunner: ITenantTransactionRunner,
      ) => new EditarFechaEtapaDeItemUseCase(compraRepo, registrarOperacion, txRunner),
      inject: [COMPRA_REPOSITORY, RegistrarOperacionCompra, TENANT_TX_RUNNER],
    },
    {
      provide: CerrarItemConFaltanteUseCase,
      useFactory: (
        compraRepo: ICompraRepository,
        registrarOperacionCompra: RegistrarOperacionCompra,
        txRunner: ITenantTransactionRunner,
      ) => new CerrarItemConFaltanteUseCase(compraRepo, registrarOperacionCompra, txRunner),
      inject: [COMPRA_REPOSITORY, RegistrarOperacionCompra, TENANT_TX_RUNNER],
    },
    {
      provide: CancelarCompraUseCase,
      useFactory: (
        compraRepo: ICompraRepository,
        registrarOperacionCompra: RegistrarOperacionCompra,
        txRunner: ITenantTransactionRunner,
      ) => new CancelarCompraUseCase(compraRepo, registrarOperacionCompra, txRunner),
      inject: [COMPRA_REPOSITORY, RegistrarOperacionCompra, TENANT_TX_RUNNER],
    },

    // ─── Consultas — SIN TENANT_TX_RUNNER, SIN bitácora (§4.9/§4.10, deliberado) ───
    {
      provide: ListarComprasUseCase,
      useFactory: (compraRepo: ICompraRepository) => new ListarComprasUseCase(compraRepo),
      inject: [COMPRA_REPOSITORY],
    },
    {
      provide: ObtenerCompraUseCase,
      useFactory: (compraRepo: ICompraRepository) => new ObtenerCompraUseCase(compraRepo),
      inject: [COMPRA_REPOSITORY],
    },
    {
      provide: ListarOperacionesCompraUseCase,
      useFactory: (compraRepo: ICompraRepository, operacionRepo: IOperacionCompraRepository) =>
        new ListarOperacionesCompraUseCase(compraRepo, operacionRepo),
      inject: [COMPRA_REPOSITORY, OPERACION_COMPRA_REPOSITORY],
    },
    {
      provide: ExportarComprasUseCase,
      useFactory: (compraRepo: ICompraRepository) => new ExportarComprasUseCase(compraRepo),
      inject: [COMPRA_REPOSITORY],
    },
  ],
  exports: [COMPRA_REPOSITORY, OPERACION_COMPRA_REPOSITORY],
})
export class ComprasModule {}
