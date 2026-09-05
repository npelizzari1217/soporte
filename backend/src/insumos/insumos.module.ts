/**
 * InsumosModule — módulo NestJS del módulo de insumos. Hoy registra los TRES
 * catálogos auxiliares (`FamiliaInsumo`, `UnidadMedida` y `ModeloEquipo`) en un
 * solo módulo: son el vocabulario del mismo agregado (`insumos.familia_id` y
 * `insumos.unidad_medida_id` son FK a las dos primeras, y
 * `insumos_modelo_equipo.modelo_equipo_id` a la tercera), así que separarlos en
 * módulos NestJS distintos obligaría a `InsumosModule` a importar los tres para
 * poder resolver un alta de insumo.
 *
 * `ModeloEquipo` vive ACÁ y no en `EquiposModule` porque su razón de existir es
 * la compatibilidad con insumos: `equipos_informaticos.modelo_equipo_id` es un
 * consumidor del catálogo, no su dueño.
 *
 * Los tres puertos se EXPORTAN: el ABM de `Insumo` los va a necesitar para
 * validar que la familia, la unidad y los modelos compatibles referenciados
 * existen y están vigentes.
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

import { FamiliasInsumoController } from './interface/controllers/familias-insumo.controller';
import { UnidadesMedidaController } from './interface/controllers/unidades-medida.controller';
import { ModelosEquipoController } from './interface/controllers/modelos-equipo.controller';

@Module({
  imports: [AuthModule],
  controllers: [FamiliasInsumoController, UnidadesMedidaController, ModelosEquipoController],
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
  ],
  exports: [FAMILIA_INSUMO_REPOSITORY, UNIDAD_MEDIDA_REPOSITORY, MODELO_EQUIPO_REPOSITORY],
})
export class InsumosModule {}
