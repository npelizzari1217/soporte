/**
 * SectoresModule — módulo NestJS del catálogo de sectores (WU-07,
 * sdd/compras-tres-etapas-y-sectores). Módulo propio (ADR-T10): el dueño del
 * sector no es Compras, hoy es su único consumidor — invertiría la
 * dependencia mañana si viviera dentro de `compras/`. `ComprasModule`
 * importa `SECTOR_REPOSITORY` de acá (WU-09), mismo precedente que
 * `resolver-ciclo-activo-compra.service.ts` reusando `ICicloClienteRepository`
 * de `tickets/`.
 *
 * Importa `AuthModule` para `JwtAuthGuard`/`TenantGuard`/`AdminClienteGuard`
 * vía `@UseGuards` en `SectoresController` (mismo patrón que `TicketsModule`).
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';

import { ISectorRepository, SECTOR_REPOSITORY } from './domain/ports/i-sector.repository';
import { PrismaSectorRepository } from './infrastructure/persistence/prisma/prisma-sector.repository';

import { CrearSectorUseCase } from './application/use-cases/crear-sector.use-case';
import { EditarSectorUseCase } from './application/use-cases/editar-sector.use-case';
import { CambiarEstadoActivoSectorUseCase } from './application/use-cases/cambiar-estado-activo-sector.use-case';
import { ListarSectoresUseCase } from './application/use-cases/listar-sectores.use-case';

import { SectoresController } from './interface/controllers/sectores.controller';

@Module({
  imports: [AuthModule],
  controllers: [SectoresController],
  providers: [
    { provide: SECTOR_REPOSITORY, useClass: PrismaSectorRepository },
    {
      provide: CrearSectorUseCase,
      useFactory: (repo: ISectorRepository) => new CrearSectorUseCase(repo),
      inject: [SECTOR_REPOSITORY],
    },
    {
      provide: EditarSectorUseCase,
      useFactory: (repo: ISectorRepository) => new EditarSectorUseCase(repo),
      inject: [SECTOR_REPOSITORY],
    },
    {
      provide: CambiarEstadoActivoSectorUseCase,
      useFactory: (repo: ISectorRepository) => new CambiarEstadoActivoSectorUseCase(repo),
      inject: [SECTOR_REPOSITORY],
    },
    {
      provide: ListarSectoresUseCase,
      useFactory: (repo: ISectorRepository) => new ListarSectoresUseCase(repo),
      inject: [SECTOR_REPOSITORY],
    },
  ],
  exports: [SECTOR_REPOSITORY],
})
export class SectoresModule {}
