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
 * Los cuatro puertos se EXPORTAN: los tres catálogos porque el ABM de
 * `Insumo` los usa para validar que la familia, la unidad y los modelos
 * compatibles referenciados existen y están vigentes, e `INSUMO_REPOSITORY`
 * porque los movimientos de existencias (Entrega 2) van a resolver el insumo
 * desde su propio módulo.
 *
 * Importa `AuthModule` para `JwtAuthGuard`/`TenantGuard`/`AdminClienteGuard`
 * vía `@UseGuards` en los controllers (mismo patrón que `SectoresModule`).
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

import { CrearInsumoUseCase } from './application/use-cases/crear-insumo.use-case';
import { EditarInsumoUseCase } from './application/use-cases/editar-insumo.use-case';
import { CambiarEstadoActivoInsumoUseCase } from './application/use-cases/cambiar-estado-activo-insumo.use-case';
import { ListarInsumosUseCase } from './application/use-cases/listar-insumos.use-case';

import { FamiliasInsumoController } from './interface/controllers/familias-insumo.controller';
import { UnidadesMedidaController } from './interface/controllers/unidades-medida.controller';
import { ModelosEquipoController } from './interface/controllers/modelos-equipo.controller';
import { InsumosController } from './interface/controllers/insumos.controller';

@Module({
  imports: [AuthModule],
  controllers: [
    FamiliasInsumoController,
    UnidadesMedidaController,
    ModelosEquipoController,
    InsumosController,
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
      // El alta y la edición reciben los TRES puertos: el insumo valida que su
      // familia y su unidad sean elegibles, y "existe" no es "es elegible" —la
      // FK deja pasar la fila deshabilitada—.
      provide: CrearInsumoUseCase,
      useFactory: (
        insumoRepo: IInsumoRepository,
        familiaRepo: IFamiliaInsumoRepository,
        unidadRepo: IUnidadMedidaRepository,
      ) => new CrearInsumoUseCase(insumoRepo, familiaRepo, unidadRepo),
      inject: [INSUMO_REPOSITORY, FAMILIA_INSUMO_REPOSITORY, UNIDAD_MEDIDA_REPOSITORY],
    },
    {
      provide: EditarInsumoUseCase,
      useFactory: (
        insumoRepo: IInsumoRepository,
        familiaRepo: IFamiliaInsumoRepository,
        unidadRepo: IUnidadMedidaRepository,
      ) => new EditarInsumoUseCase(insumoRepo, familiaRepo, unidadRepo),
      inject: [INSUMO_REPOSITORY, FAMILIA_INSUMO_REPOSITORY, UNIDAD_MEDIDA_REPOSITORY],
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
  ],
  exports: [
    FAMILIA_INSUMO_REPOSITORY,
    UNIDAD_MEDIDA_REPOSITORY,
    MODELO_EQUIPO_REPOSITORY,
    INSUMO_REPOSITORY,
  ],
})
export class InsumosModule {}
