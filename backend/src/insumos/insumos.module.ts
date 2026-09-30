/**
 * InsumosModule — módulo NestJS del módulo de insumos: el agregado `Insumo` y
 * los tres catálogos auxiliares que son su vocabulario (`FamiliaInsumo`,
 * `UnidadMedida` y `ModeloEquipo`), todos en un solo módulo.
 *
 * Van juntos porque el alta de un insumo los resuelve a los tres
 * (`insumos.familia_id` y `insumos.unidad_medida_id` son FK a los dos
 * primeros, y `insumos_modelos_equipo.modelo_equipo_id` al tercero): en
 * módulos NestJS distintos, `InsumosModule` tendría que importar los tres para
 * poder resolver un alta.
 *
 * `ModeloEquipo` vive ACÁ y no en `EquiposModule` porque su razón de existir es
 * la compatibilidad con insumos: `equipos_informaticos.modelo_equipo_id` es un
 * consumidor del catálogo, no su dueño.
 *
 * Los cuatro puertos del catálogo se EXPORTAN: los tres auxiliares porque el
 * ABM de `Insumo` los usa para validar que la familia, la unidad y los modelos
 * compatibles referenciados existen y están vigentes, e `INSUMO_REPOSITORY`
 * porque los movimientos de existencias resuelven el insumo desde acá.
 *
 * **`MOVIMIENTO_INSUMO_REPOSITORY` NO se exporta, y esa asimetría es
 * deliberada.** Sus únicos consumidores son los cinco casos de uso de este
 * mismo módulo. La invariante del stock —que el saldo no quede negativo—
 * depende de que TODA escritura pase por el único punto que toma el advisory
 * lock, y Postgres no puede expresar `SUM(cantidad) >= 0` sobre varias filas,
 * así que no hay backstop de base que atrape la fuga. Exportar el puerto sería
 * ofrecerle a otro módulo el camino para abrirla.
 *
 * **`RegistrarEntradaInsumoUseCase` SÍ se exporta** (insumos-entrega-3, unidad
 * 5): lo consume `ComprasModule` para que recibir una compra sume el stock
 * solo. Se exporta el CASO DE USO y no el puerto de movimientos justamente por
 * el párrafo anterior — compras obtiene la capacidad de asentar una entrada,
 * con sus guards de elegibilidad puestos, y no el acceso crudo a la bitácora.
 * La dependencia va `compras → insumos` y nunca al revés: `insumos` no importa
 * nada de `compras`, porque esa arista cerraría un ciclo entre los dos.
 *
 * **`RegistrarSalidaInsumoUseCase` TAMBIÉN se exporta** (WU-4,
 * sdd/repuestos-instalar-desde-deposito, issue #153): lo consume `EquiposModule`
 * para que instalar un repuesto del depósito descuente el stock y cree el
 * componente en una sola transacción
 * (`InstalarComponenteDesdeDepositoUseCase`). Mismo criterio que la entrada:
 * se exporta el CASO DE USO, con su advisory lock y su validación de stock ya
 * puestos, nunca el puerto de movimientos — exportar el puerto le daría a
 * `equipos` el camino para asentar una salida SIN pasar por el lock, que es
 * justamente la fuga que el párrafo de arriba explica que no hay backstop de
 * base para atrapar. La dependencia sigue yendo `equipos → insumos`, mismo
 * sentido que ya tiene por `MODELO_EQUIPO_REPOSITORY`/`INSUMO_REPOSITORY`/
 * `FAMILIA_INSUMO_REPOSITORY` (WU-3) — sin ciclo nuevo.
 *
 * Importa `AuthModule` para `JwtAuthGuard`/`TenantGuard`/`AdminClienteGuard`/
 * `AccionesGuard` vía `@UseGuards` en los controllers (mismo patrón que
 * `SectoresModule`). `TENANT_TX_RUNNER` no se importa: lo provee `SharedModule`,
 * que es `@Global`.
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';

import {
  IFamiliaInsumoRepository,
  FAMILIA_INSUMO_REPOSITORY,
} from './domain/ports/i-familia-insumo.repository';
import {
  IUnidadMedidaRepository,
  UNIDAD_MEDIDA_REPOSITORY,
} from './domain/ports/i-unidad-medida.repository';
import { PrismaFamiliaInsumoRepository } from './infrastructure/persistence/prisma/prisma-familia-insumo.repository';
import {
  IModeloEquipoRepository,
  MODELO_EQUIPO_REPOSITORY,
} from './domain/ports/i-modelo-equipo.repository';
import { PrismaUnidadMedidaRepository } from './infrastructure/persistence/prisma/prisma-unidad-medida.repository';
import { PrismaModeloEquipoRepository } from './infrastructure/persistence/prisma/prisma-modelo-equipo.repository';
import { IInsumoRepository, INSUMO_REPOSITORY } from './domain/ports/i-insumo.repository';
import { PrismaInsumoRepository } from './infrastructure/persistence/prisma/prisma-insumo.repository';
import {
  IMovimientoInsumoRepository,
  MOVIMIENTO_INSUMO_REPOSITORY,
} from './domain/ports/i-movimiento-insumo.repository';
import { PrismaMovimientoInsumoRepository } from './infrastructure/persistence/prisma/prisma-movimiento-insumo.repository';
import { UNIDAD_INSUMO_REPOSITORY } from './domain/ports/i-unidad-insumo.repository';
import { PrismaUnidadInsumoRepository } from './infrastructure/persistence/prisma/prisma-unidad-insumo.repository';
import {
  ITenantTransactionRunner,
  TENANT_TX_RUNNER,
} from '../shared/infrastructure/persistence/tenant-transaction-runner';

import { CrearFamiliaInsumoUseCase } from './application/use-cases/crear-familia-insumo.use-case';
import { EditarFamiliaInsumoUseCase } from './application/use-cases/editar-familia-insumo.use-case';
import { CambiarEstadoActivoFamiliaInsumoUseCase } from './application/use-cases/cambiar-estado-activo-familia-insumo.use-case';
import { ListarFamiliasInsumoUseCase } from './application/use-cases/listar-familias-insumo.use-case';

import { CrearUnidadMedidaUseCase } from './application/use-cases/crear-unidad-medida.use-case';
import { EditarUnidadMedidaUseCase } from './application/use-cases/editar-unidad-medida.use-case';
import { CambiarEstadoActivoUnidadMedidaUseCase } from './application/use-cases/cambiar-estado-activo-unidad-medida.use-case';
import { ListarUnidadesMedidaUseCase } from './application/use-cases/listar-unidades-medida.use-case';

import { CrearModeloEquipoUseCase } from './application/use-cases/crear-modelo-equipo.use-case';
import { EditarModeloEquipoUseCase } from './application/use-cases/editar-modelo-equipo.use-case';
import { CambiarEstadoActivoModeloEquipoUseCase } from './application/use-cases/cambiar-estado-activo-modelo-equipo.use-case';
import { ListarModelosEquipoUseCase } from './application/use-cases/listar-modelos-equipo.use-case';

import { NumeradorInsumo } from './domain/services/numerador-insumo.service';

import { CrearInsumoUseCase } from './application/use-cases/crear-insumo.use-case';
import { EditarInsumoUseCase } from './application/use-cases/editar-insumo.use-case';
import { CambiarEstadoActivoInsumoUseCase } from './application/use-cases/cambiar-estado-activo-insumo.use-case';
import { ListarInsumosUseCase } from './application/use-cases/listar-insumos.use-case';
import { ListarInsumosPorModeloEquipoUseCase } from './application/use-cases/listar-insumos-por-modelo-equipo.use-case';

import { RegistrarEntradaInsumoUseCase } from './application/use-cases/registrar-entrada-insumo.use-case';
import { RegistrarSalidaInsumoUseCase } from './application/use-cases/registrar-salida-insumo.use-case';
import { RegistrarAjusteInsumoUseCase } from './application/use-cases/registrar-ajuste-insumo.use-case';
import { ConsultarStockInsumoUseCase } from './application/use-cases/consultar-stock-insumo.use-case';
import { ListarMovimientosInsumoUseCase } from './application/use-cases/listar-movimientos-insumo.use-case';

import { FamiliasInsumoController } from './interface/controllers/familias-insumo.controller';
import { UnidadesMedidaController } from './interface/controllers/unidades-medida.controller';
import { ModelosEquipoController } from './interface/controllers/modelos-equipo.controller';
import { InsumosController } from './interface/controllers/insumos.controller';
import { MovimientosInsumoController } from './interface/controllers/movimientos-insumo.controller';

@Module({
  imports: [AuthModule],
  controllers: [
    FamiliasInsumoController,
    UnidadesMedidaController,
    ModelosEquipoController,
    InsumosController,
    MovimientosInsumoController,
  ],
  providers: [
    { provide: FAMILIA_INSUMO_REPOSITORY, useClass: PrismaFamiliaInsumoRepository },
    {
      provide: CrearFamiliaInsumoUseCase,
      useFactory: (repo: IFamiliaInsumoRepository) => new CrearFamiliaInsumoUseCase(repo),
      inject: [FAMILIA_INSUMO_REPOSITORY],
    },
    {
      provide: EditarFamiliaInsumoUseCase,
      useFactory: (repo: IFamiliaInsumoRepository) => new EditarFamiliaInsumoUseCase(repo),
      inject: [FAMILIA_INSUMO_REPOSITORY],
    },
    {
      provide: CambiarEstadoActivoFamiliaInsumoUseCase,
      useFactory: (repo: IFamiliaInsumoRepository) =>
        new CambiarEstadoActivoFamiliaInsumoUseCase(repo),
      inject: [FAMILIA_INSUMO_REPOSITORY],
    },
    {
      provide: ListarFamiliasInsumoUseCase,
      useFactory: (repo: IFamiliaInsumoRepository) => new ListarFamiliasInsumoUseCase(repo),
      inject: [FAMILIA_INSUMO_REPOSITORY],
    },

    { provide: UNIDAD_MEDIDA_REPOSITORY, useClass: PrismaUnidadMedidaRepository },
    // Unidades por número de serie (sdd/repuestos-numero-de-serie, ADR-4). No se
    // exporta: la única puerta de las unidades será `OperacionesUnidadInsumo`.
    { provide: UNIDAD_INSUMO_REPOSITORY, useClass: PrismaUnidadInsumoRepository },
    {
      provide: CrearUnidadMedidaUseCase,
      useFactory: (repo: IUnidadMedidaRepository) => new CrearUnidadMedidaUseCase(repo),
      inject: [UNIDAD_MEDIDA_REPOSITORY],
    },
    {
      provide: EditarUnidadMedidaUseCase,
      useFactory: (repo: IUnidadMedidaRepository) => new EditarUnidadMedidaUseCase(repo),
      inject: [UNIDAD_MEDIDA_REPOSITORY],
    },
    {
      provide: CambiarEstadoActivoUnidadMedidaUseCase,
      useFactory: (repo: IUnidadMedidaRepository) =>
        new CambiarEstadoActivoUnidadMedidaUseCase(repo),
      inject: [UNIDAD_MEDIDA_REPOSITORY],
    },
    {
      provide: ListarUnidadesMedidaUseCase,
      useFactory: (repo: IUnidadMedidaRepository) => new ListarUnidadesMedidaUseCase(repo),
      inject: [UNIDAD_MEDIDA_REPOSITORY],
    },

    { provide: MODELO_EQUIPO_REPOSITORY, useClass: PrismaModeloEquipoRepository },
    {
      provide: CrearModeloEquipoUseCase,
      useFactory: (repo: IModeloEquipoRepository) => new CrearModeloEquipoUseCase(repo),
      inject: [MODELO_EQUIPO_REPOSITORY],
    },
    {
      provide: EditarModeloEquipoUseCase,
      useFactory: (repo: IModeloEquipoRepository) => new EditarModeloEquipoUseCase(repo),
      inject: [MODELO_EQUIPO_REPOSITORY],
    },
    {
      provide: CambiarEstadoActivoModeloEquipoUseCase,
      useFactory: (repo: IModeloEquipoRepository) =>
        new CambiarEstadoActivoModeloEquipoUseCase(repo),
      inject: [MODELO_EQUIPO_REPOSITORY],
    },
    {
      provide: ListarModelosEquipoUseCase,
      useFactory: (repo: IModeloEquipoRepository) => new ListarModelosEquipoUseCase(repo),
      inject: [MODELO_EQUIPO_REPOSITORY],
    },

    { provide: INSUMO_REPOSITORY, useClass: PrismaInsumoRepository },
    {
      // `NumeradorInsumo` es una clase plana (sin `@Injectable`) — se resuelve
      // vía `useFactory`, igual que `NumeradorCompra` en `CompraModule` y
      // `NumeradorTicket` en `EquiposModule` (issue #162).
      provide: NumeradorInsumo,
      useFactory: (repo: IInsumoRepository) => new NumeradorInsumo(repo),
      inject: [INSUMO_REPOSITORY],
    },
    {
      // El alta recibe, además, `NumeradorInsumo` y `TENANT_TX_RUNNER` (issue
      // #162): la rama de autogeneración de `codigo` necesita el numerador y
      // corre su sección crítica (numeración + guardado) dentro de una
      // transacción para que el advisory lock de
      // `PrismaInsumoRepository.findLastSecuenciaCodigo` sirva de algo. El
      // camino de código a mano no los usa, mismo criterio que
      // `RegistrarEntradaInsumoUseCase` no recibe el runner.
      provide: CrearInsumoUseCase,
      useFactory: (
        insumoRepo: IInsumoRepository,
        familiaRepo: IFamiliaInsumoRepository,
        unidadRepo: IUnidadMedidaRepository,
        modeloRepo: IModeloEquipoRepository,
        numerador: NumeradorInsumo,
        txRunner: ITenantTransactionRunner,
      ) =>
        new CrearInsumoUseCase(
          insumoRepo,
          familiaRepo,
          unidadRepo,
          modeloRepo,
          numerador,
          txRunner,
        ),
      inject: [
        INSUMO_REPOSITORY,
        FAMILIA_INSUMO_REPOSITORY,
        UNIDAD_MEDIDA_REPOSITORY,
        MODELO_EQUIPO_REPOSITORY,
        NumeradorInsumo,
        TENANT_TX_RUNNER,
      ],
    },
    {
      provide: EditarInsumoUseCase,
      useFactory: (
        insumoRepo: IInsumoRepository,
        familiaRepo: IFamiliaInsumoRepository,
        unidadRepo: IUnidadMedidaRepository,
        modeloRepo: IModeloEquipoRepository,
      ) => new EditarInsumoUseCase(insumoRepo, familiaRepo, unidadRepo, modeloRepo),
      inject: [
        INSUMO_REPOSITORY,
        FAMILIA_INSUMO_REPOSITORY,
        UNIDAD_MEDIDA_REPOSITORY,
        MODELO_EQUIPO_REPOSITORY,
      ],
    },
    {
      provide: CambiarEstadoActivoInsumoUseCase,
      useFactory: (repo: IInsumoRepository) => new CambiarEstadoActivoInsumoUseCase(repo),
      inject: [INSUMO_REPOSITORY],
    },
    {
      provide: ListarInsumosUseCase,
      useFactory: (repo: IInsumoRepository) => new ListarInsumosUseCase(repo),
      inject: [INSUMO_REPOSITORY],
    },
    {
      // Lo consume `ModelosEquipoController`, que vive en este mismo módulo: la
      // consulta mira la relación desde el lado del modelo, pero el dato que
      // devuelve es el insumo.
      provide: ListarInsumosPorModeloEquipoUseCase,
      useFactory: (repo: IInsumoRepository) => new ListarInsumosPorModeloEquipoUseCase(repo),
      inject: [INSUMO_REPOSITORY],
    },

    { provide: MOVIMIENTO_INSUMO_REPOSITORY, useClass: PrismaMovimientoInsumoRepository },
    {
      // La ENTRADA NO recibe el runner de transacciones, y esa ausencia es la
      // decisión: una entrada SUMA, así que no puede dejar el saldo negativo y
      // no tiene nada que decidir bajo la sección crítica. El `Pick` angosto de
      // su constructor es lo que le impide tomar el advisory lock por
      // descuido; pasarle el runner acá lo volvería posible de nuevo.
      provide: RegistrarEntradaInsumoUseCase,
      useFactory: (
        insumoRepo: IInsumoRepository,
        movimientoRepo: IMovimientoInsumoRepository,
        familiaRepo: IFamiliaInsumoRepository,
      ) => new RegistrarEntradaInsumoUseCase(insumoRepo, movimientoRepo, familiaRepo),
      inject: [INSUMO_REPOSITORY, MOVIMIENTO_INSUMO_REPOSITORY, FAMILIA_INSUMO_REPOSITORY],
    },
    {
      // La SALIDA y el AJUSTE sí lo reciben: los dos pueden restar, y leer las
      // sumas y escribir el asiento tienen que ocurrir dentro de la MISMA
      // transacción para que el advisory lock sirva de algo.
      provide: RegistrarSalidaInsumoUseCase,
      useFactory: (
        insumoRepo: IInsumoRepository,
        movimientoRepo: IMovimientoInsumoRepository,
        txRunner: ITenantTransactionRunner,
        familiaRepo: IFamiliaInsumoRepository,
      ) => new RegistrarSalidaInsumoUseCase(insumoRepo, movimientoRepo, txRunner, familiaRepo),
      inject: [
        INSUMO_REPOSITORY,
        MOVIMIENTO_INSUMO_REPOSITORY,
        TENANT_TX_RUNNER,
        FAMILIA_INSUMO_REPOSITORY,
      ],
    },
    {
      provide: RegistrarAjusteInsumoUseCase,
      useFactory: (
        insumoRepo: IInsumoRepository,
        movimientoRepo: IMovimientoInsumoRepository,
        txRunner: ITenantTransactionRunner,
        familiaRepo: IFamiliaInsumoRepository,
      ) => new RegistrarAjusteInsumoUseCase(insumoRepo, movimientoRepo, txRunner, familiaRepo),
      inject: [
        INSUMO_REPOSITORY,
        MOVIMIENTO_INSUMO_REPOSITORY,
        TENANT_TX_RUNNER,
        FAMILIA_INSUMO_REPOSITORY,
      ],
    },
    {
      // La consulta tampoco lo recibe: usa `sumByTipo()`, la lectura SIN lock.
      // Mostrar un número en pantalla no puede hacer esperar a los técnicos que
      // están sacando cosas del depósito.
      provide: ConsultarStockInsumoUseCase,
      useFactory: (
        insumoRepo: IInsumoRepository,
        movimientoRepo: IMovimientoInsumoRepository,
        familiaRepo: IFamiliaInsumoRepository,
      ) => new ConsultarStockInsumoUseCase(insumoRepo, movimientoRepo, familiaRepo),
      inject: [INSUMO_REPOSITORY, MOVIMIENTO_INSUMO_REPOSITORY, FAMILIA_INSUMO_REPOSITORY],
    },
    {
      // El LISTADO tampoco recibe el runner, por el mismo motivo que la
      // consulta de stock: usa `listarPorInsumo()`, la lectura sin lock.
      // Dibujar la bitácora de la ficha no puede hacer esperar a los técnicos
      // que están sacando cosas del depósito. Su `Pick` de dos métodos es lo
      // que le impide sumar la bitácora o escribir en ella.
      provide: ListarMovimientosInsumoUseCase,
      useFactory: (insumoRepo: IInsumoRepository, movimientoRepo: IMovimientoInsumoRepository) =>
        new ListarMovimientosInsumoUseCase(insumoRepo, movimientoRepo),
      inject: [INSUMO_REPOSITORY, MOVIMIENTO_INSUMO_REPOSITORY],
    },
  ],
  exports: [
    FAMILIA_INSUMO_REPOSITORY,
    UNIDAD_MEDIDA_REPOSITORY,
    MODELO_EQUIPO_REPOSITORY,
    INSUMO_REPOSITORY,
    RegistrarEntradaInsumoUseCase,
    RegistrarSalidaInsumoUseCase,
  ],
})
export class InsumosModule {}
