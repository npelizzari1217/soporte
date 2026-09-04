/**
 * InsumosModule — módulo NestJS del módulo de insumos. Hoy registra los DOS
 * catálogos auxiliares (`FamiliaInsumo` y `UnidadMedida`) en un solo módulo:
 * son el vocabulario del mismo agregado (`insumos.familia_id` y
 * `insumos.unidad_medida_id` son FK a estas dos tablas), así que separarlos en
 * dos módulos NestJS obligaría a `InsumosModule` a importar los dos para poder
 * resolver un alta de insumo.
 *
 * Los dos puertos se EXPORTAN: el ABM de `Insumo` los va a necesitar para
 * validar que la familia y la unidad referenciadas existen y están vigentes.
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
import { PrismaUnidadMedidaRepository } from './infrastructure/persistence/prisma/prisma-unidad-medida.repository';

import { CrearFamiliaInsumoUseCase } from './application/use-cases/crear-familia-insumo.use-case';
import { EditarFamiliaInsumoUseCase } from './application/use-cases/editar-familia-insumo.use-case';
import { CambiarEstadoActivoFamiliaInsumoUseCase } from './application/use-cases/cambiar-estado-activo-familia-insumo.use-case';
import { ListarFamiliasInsumoUseCase } from './application/use-cases/listar-familias-insumo.use-case';

import { CrearUnidadMedidaUseCase } from './application/use-cases/crear-unidad-medida.use-case';
import { EditarUnidadMedidaUseCase } from './application/use-cases/editar-unidad-medida.use-case';
import { CambiarEstadoActivoUnidadMedidaUseCase } from './application/use-cases/cambiar-estado-activo-unidad-medida.use-case';
import { ListarUnidadesMedidaUseCase } from './application/use-cases/listar-unidades-medida.use-case';

import { FamiliasInsumoController } from './interface/controllers/familias-insumo.controller';
import { UnidadesMedidaController } from './interface/controllers/unidades-medida.controller';

@Module({
  imports: [AuthModule],
  controllers: [FamiliasInsumoController, UnidadesMedidaController],
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
  ],
  exports: [FAMILIA_INSUMO_REPOSITORY, UNIDAD_MEDIDA_REPOSITORY],
})
export class InsumosModule {}
