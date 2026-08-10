/**
 * TiposComponenteModule — módulo NestJS del catálogo MASTER de tipos de
 * componente (`master.tipos_componente`).
 *
 * PR1 (dominio + puerto + repo master) ya provee la entidad `TipoComponente`
 * y `ITipoComponenteMasterRepository`. Este módulo (PR2) wirea el ABM
 * completo (use cases + controller ROOT).
 *
 * FITNESS RULE: PrismaService y @prisma/client solo pueden importarse desde
 * infrastructure/ (ver `backend/eslint.config.js`).
 *
 * Importa `AuthModule` para poder usar `JwtAuthGuard`/`GlobalAdminGuard` vía
 * `@UseGuards` en `TiposComponenteController` (mismo patrón que
 * `ClientesModule`).
 *
 * Tarea: sdd/tipos-componente-master (PR2 — ABM del catálogo maestro).
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';

import {
  ITipoComponenteMasterRepository,
  TIPO_COMPONENTE_MASTER_REPOSITORY,
} from './domain/ports/i-tipo-componente-master.repository';
import { PrismaTipoComponenteMasterRepository } from './infrastructure/persistence/prisma/prisma-tipo-componente-master.repository';

import { CrearTipoComponenteUseCase } from './application/use-cases/crear-tipo-componente.use-case';
import { RenombrarTipoComponenteUseCase } from './application/use-cases/renombrar-tipo-componente.use-case';
import { DesactivarTipoComponenteUseCase } from './application/use-cases/desactivar-tipo-componente.use-case';
import { ActivarTipoComponenteUseCase } from './application/use-cases/activar-tipo-componente.use-case';
import { ListarTiposComponenteAdminUseCase } from './application/use-cases/listar-tipos-componente-admin.use-case';

import { TiposComponenteController } from './interface/controllers/tipos-componente.controller';

@Module({
  imports: [AuthModule],
  controllers: [TiposComponenteController],
  providers: [
    { provide: TIPO_COMPONENTE_MASTER_REPOSITORY, useClass: PrismaTipoComponenteMasterRepository },
    {
      provide: CrearTipoComponenteUseCase,
      useFactory: (repo: ITipoComponenteMasterRepository) => new CrearTipoComponenteUseCase(repo),
      inject: [TIPO_COMPONENTE_MASTER_REPOSITORY],
    },
    {
      provide: RenombrarTipoComponenteUseCase,
      useFactory: (repo: ITipoComponenteMasterRepository) =>
        new RenombrarTipoComponenteUseCase(repo),
      inject: [TIPO_COMPONENTE_MASTER_REPOSITORY],
    },
    {
      provide: DesactivarTipoComponenteUseCase,
      useFactory: (repo: ITipoComponenteMasterRepository) =>
        new DesactivarTipoComponenteUseCase(repo),
      inject: [TIPO_COMPONENTE_MASTER_REPOSITORY],
    },
    {
      provide: ActivarTipoComponenteUseCase,
      useFactory: (repo: ITipoComponenteMasterRepository) => new ActivarTipoComponenteUseCase(repo),
      inject: [TIPO_COMPONENTE_MASTER_REPOSITORY],
    },
    {
      provide: ListarTiposComponenteAdminUseCase,
      useFactory: (repo: ITipoComponenteMasterRepository) =>
        new ListarTiposComponenteAdminUseCase(repo),
      inject: [TIPO_COMPONENTE_MASTER_REPOSITORY],
    },
  ],
  exports: [],
})
export class TiposComponenteModule {}
