/**
 * RespuestasPredefinidasModule — módulo NestJS del catálogo de respuestas predefinidas de
 * soporte (roadmap segunda etapa, punto 4). Importa `AuthModule` para
 * `JwtAuthGuard`/`TenantGuard`/`AdminClienteGuard` vía `@UseGuards` en el controller (mismo
 * patrón que `SectoresModule`). Nadie lo consume: el texto se copia al comentario.
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';

import {
  IRespuestaPredefinidaRepository,
  RESPUESTA_PREDEFINIDA_REPOSITORY,
} from './domain/ports/i-respuesta-predefinida.repository';
import { PrismaRespuestaPredefinidaRepository } from './infrastructure/persistence/prisma/prisma-respuesta-predefinida.repository';

import { CrearRespuestaPredefinidaUseCase } from './application/use-cases/crear-respuesta-predefinida.use-case';
import { EditarRespuestaPredefinidaUseCase } from './application/use-cases/editar-respuesta-predefinida.use-case';
import { CambiarEstadoActivoRespuestaPredefinidaUseCase } from './application/use-cases/cambiar-estado-activo-respuesta-predefinida.use-case';
import { ListarRespuestasPredefinidasUseCase } from './application/use-cases/listar-respuestas-predefinidas.use-case';

import { RespuestasPredefinidasController } from './interface/controllers/respuestas-predefinidas.controller';

@Module({
  imports: [AuthModule],
  controllers: [RespuestasPredefinidasController],
  providers: [
    { provide: RESPUESTA_PREDEFINIDA_REPOSITORY, useClass: PrismaRespuestaPredefinidaRepository },
    {
      provide: CrearRespuestaPredefinidaUseCase,
      useFactory: (repo: IRespuestaPredefinidaRepository) =>
        new CrearRespuestaPredefinidaUseCase(repo),
      inject: [RESPUESTA_PREDEFINIDA_REPOSITORY],
    },
    {
      provide: EditarRespuestaPredefinidaUseCase,
      useFactory: (repo: IRespuestaPredefinidaRepository) =>
        new EditarRespuestaPredefinidaUseCase(repo),
      inject: [RESPUESTA_PREDEFINIDA_REPOSITORY],
    },
    {
      provide: CambiarEstadoActivoRespuestaPredefinidaUseCase,
      useFactory: (repo: IRespuestaPredefinidaRepository) =>
        new CambiarEstadoActivoRespuestaPredefinidaUseCase(repo),
      inject: [RESPUESTA_PREDEFINIDA_REPOSITORY],
    },
    {
      provide: ListarRespuestasPredefinidasUseCase,
      useFactory: (repo: IRespuestaPredefinidaRepository) =>
        new ListarRespuestasPredefinidasUseCase(repo),
      inject: [RESPUESTA_PREDEFINIDA_REPOSITORY],
    },
  ],
})
export class RespuestasPredefinidasModule {}
