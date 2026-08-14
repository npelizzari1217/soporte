import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TicketsModule } from '../tickets/tickets.module';

import {
  ITenantTransactionRunner,
  TENANT_TX_RUNNER,
} from '../shared/infrastructure/persistence/tenant-transaction-runner';
import {
  CICLO_CLIENTE_REPOSITORY,
  ICicloClienteRepository,
} from '../tickets/domain/ports/i-ciclo-cliente.repository';
import { ResolverCicloActivoParaCreacion } from '../tickets/application/services/resolver-ciclo-activo.service';

import { COMPRA_REPOSITORY, ICompraRepository } from './domain/ports/i-compra.repository';
import { PrismaCompraRepository } from './infrastructure/persistence/prisma/prisma-compra.repository';
import {
  OPERACION_COMPRA_REPOSITORY,
  IOperacionCompraRepository,
} from './domain/ports/i-operacion-compra.repository';
import { PrismaOperacionCompraRepository } from './infrastructure/persistence/prisma/prisma-operacion-compra.repository';

import { NumeradorCompra } from './domain/services/numerador-compra';
import { RegistrarOperacionCompra } from './application/services/registrar-operacion-compra';

import { CrearCompraUseCase } from './application/use-cases/crear-compra.use-case';
import { AgregarItemCompraUseCase } from './application/use-cases/agregar-item-compra.use-case';
import { EditarItemCompraUseCase } from './application/use-cases/editar-item-compra.use-case';
import { EliminarItemCompraUseCase } from './application/use-cases/eliminar-item-compra.use-case';
import { AprobarItemCompraUseCase } from './application/use-cases/aprobar-item-compra.use-case';
import { RechazarItemCompraUseCase } from './application/use-cases/rechazar-item-compra.use-case';
import { RegistrarCompraDeItemUseCase } from './application/use-cases/registrar-compra-de-item.use-case';
import { RegistrarEntregaDeItemUseCase } from './application/use-cases/registrar-entrega-de-item.use-case';
import { CerrarItemConFaltanteUseCase } from './application/use-cases/cerrar-item-con-faltante.use-case';
import { CancelarCompraUseCase } from './application/use-cases/cancelar-compra.use-case';
import { ListarComprasUseCase } from './application/use-cases/listar-compras.use-case';
import { ObtenerCompraUseCase } from './application/use-cases/obtener-compra.use-case';
import { ListarOperacionesCompraUseCase } from './application/use-cases/listar-operaciones-compra.use-case';

import { ComprasController } from './interface/controllers/compras.controller';

/**
 * ComprasModule — wiring real del dominio `compras/` (sdd/redisenio-modulo-compras,
 * PR-22, reemplaza el placeholder `@Module({})` de PR-1).
 *
 * Registra los 13 casos de uso (10 mutadores + 3 consultas), los 2 repos
 * Prisma, `NumeradorCompra` (ADR-C5) y `RegistrarOperacionCompra` (ADR-C4).
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
 *   tabla `CicloCliente` compartida, no una copia) — `ResolverCicloActivoParaCreacion`
 *   se resuelve acá vía `useFactory`, igual que en `EquiposModule`.
 * - `AuthModule`: `ComprasController` usa `JwtAuthGuard`/`TenantGuard`/
 *   `PermissionsGuard`/`ModulosGuard` (PR-21) — `TicketsModule` no re-exporta
 *   `AuthModule`, así que se importa acá explícitamente (mismo gap que
 *   `EquiposModule`/`ReparacionesModule`).
 * - `NumeradorCompra`/`RegistrarOperacionCompra` son clases planas (sin
 *   `@Injectable`) — se resuelven vía `useFactory`, igual que
 *   `NumeradorTicket`/`ResolverCicloActivoParaCreacion` en `EquiposModule`.
 * - `TENANT_TX_RUNNER` se inyecta desde `SharedModule` (`@Global`).
 *
 * FITNESS RULE: PrismaService y `@prisma/client` solo pueden importarse
 * desde `infrastructure/` (ver `backend/eslint.config.js`) — este módulo
 * inyecta los repos por token, nunca importa Prisma directo.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec. Ref design: sección CASOS DE
 * USO, ADR-C2, ADR-C4, ADR-C5. Ref tasks: PR-22 (cierra la FASE E).
 */
@Module({
  imports: [AuthModule, TicketsModule],
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
      provide: ResolverCicloActivoParaCreacion,
      useFactory: (cicloRepo: ICicloClienteRepository) =>
        new ResolverCicloActivoParaCreacion(cicloRepo),
      inject: [CICLO_CLIENTE_REPOSITORY],
    },
    {
      provide: RegistrarOperacionCompra,
      useFactory: (operacionRepo: IOperacionCompraRepository) =>
        new RegistrarOperacionCompra(operacionRepo),
      inject: [OPERACION_COMPRA_REPOSITORY],
    },

    // ─── Mutadores (10) — TODOS inyectan TENANT_TX_RUNNER + RegistrarOperacionCompra ───
    {
      provide: CrearCompraUseCase,
      useFactory: (
        compraRepo: ICompraRepository,
        numerador: NumeradorCompra,
        resolverCicloActivo: ResolverCicloActivoParaCreacion,
        registrarOperacion: RegistrarOperacionCompra,
        txRunner: ITenantTransactionRunner,
      ) =>
        new CrearCompraUseCase(
          compraRepo,
          numerador,
          resolverCicloActivo,
          registrarOperacion,
          txRunner,
        ),
      inject: [
        COMPRA_REPOSITORY,
        NumeradorCompra,
        ResolverCicloActivoParaCreacion,
        RegistrarOperacionCompra,
        TENANT_TX_RUNNER,
      ],
    },
    {
      provide: AgregarItemCompraUseCase,
      useFactory: (
        compraRepo: ICompraRepository,
        registrarOperacion: RegistrarOperacionCompra,
        txRunner: ITenantTransactionRunner,
      ) => new AgregarItemCompraUseCase(compraRepo, registrarOperacion, txRunner),
      inject: [COMPRA_REPOSITORY, RegistrarOperacionCompra, TENANT_TX_RUNNER],
    },
    {
      provide: EditarItemCompraUseCase,
      useFactory: (
        compraRepo: ICompraRepository,
        registrarOperacion: RegistrarOperacionCompra,
        txRunner: ITenantTransactionRunner,
      ) => new EditarItemCompraUseCase(compraRepo, registrarOperacion, txRunner),
      inject: [COMPRA_REPOSITORY, RegistrarOperacionCompra, TENANT_TX_RUNNER],
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
      provide: RegistrarCompraDeItemUseCase,
      useFactory: (
        compraRepo: ICompraRepository,
        registrarOperacion: RegistrarOperacionCompra,
        txRunner: ITenantTransactionRunner,
      ) => new RegistrarCompraDeItemUseCase(compraRepo, registrarOperacion, txRunner),
      inject: [COMPRA_REPOSITORY, RegistrarOperacionCompra, TENANT_TX_RUNNER],
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

    // ─── Consultas (3) — SIN TENANT_TX_RUNNER, SIN bitácora (§4.9/§4.10, deliberado) ───
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
  ],
  exports: [COMPRA_REPOSITORY, OPERACION_COMPRA_REPOSITORY],
})
export class ComprasModule {}
