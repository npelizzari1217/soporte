import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';

import {
  KB_ARTICULO_REPOSITORY,
  IKbArticuloRepository,
} from './domain/ports/i-kb-articulo.repository';
import { PrismaKbArticuloRepository } from './infrastructure/persistence/prisma/prisma-kb-articulo.repository';

import { CrearKbArticuloUseCase } from './application/use-cases/crear-kb-articulo.use-case';
import { EditarKbArticuloUseCase } from './application/use-cases/editar-kb-articulo.use-case';
import { CambiarVisibilidadKbArticuloUseCase } from './application/use-cases/cambiar-visibilidad-kb-articulo.use-case';
import { EliminarKbArticuloUseCase } from './application/use-cases/eliminar-kb-articulo.use-case';
import { ObtenerKbArticuloUseCase } from './application/use-cases/obtener-kb-articulo.use-case';
import { ListarKbArticulosUseCase } from './application/use-cases/listar-kb-articulos.use-case';

import { KbController } from './interface/controllers/kb.controller';

/**
 * KbModule — módulo NestJS del dominio "kb" (Fase 4, PR-K).
 *
 * Base de conocimiento (artículos) con CRUD gestionado por staff
 * (`kb:gestionar`, K4) y lectura filtrada por rol (K3: USUARIO solo ve
 * artículos publicados y activos; staff ve todos).
 *
 * Wiring:
 * - Repo: KB_ARTICULO_REPOSITORY (tenant, vía TenantContext).
 * - Use cases: Crear/Editar/CambiarVisibilidad/Eliminar/Obtener/ListarKb
 *   (K1-K4, todos Result).
 * - Importa `AuthModule` (guards de `KbController`: JwtAuthGuard,
 *   TenantGuard, PermissionsGuard, `kb:gestionar`). NO importa
 *   `TicketsModule` — KB no depende de TICKET_REPOSITORY (`tipoTicketId`
 *   es un FK opcional resuelto por Prisma, sin necesidad del puerto de
 *   tickets).
 *
 * FITNESS RULE: PrismaService y @prisma/client solo pueden importarse desde
 * infrastructure/ (ver backend/eslint.config.js).
 */
@Module({
  imports: [AuthModule],
  controllers: [KbController],
  providers: [
    { provide: KB_ARTICULO_REPOSITORY, useClass: PrismaKbArticuloRepository },

    {
      provide: CrearKbArticuloUseCase,
      useFactory: (repo: IKbArticuloRepository) => new CrearKbArticuloUseCase(repo),
      inject: [KB_ARTICULO_REPOSITORY],
    },
    {
      provide: EditarKbArticuloUseCase,
      useFactory: (repo: IKbArticuloRepository) => new EditarKbArticuloUseCase(repo),
      inject: [KB_ARTICULO_REPOSITORY],
    },
    {
      provide: CambiarVisibilidadKbArticuloUseCase,
      useFactory: (repo: IKbArticuloRepository) => new CambiarVisibilidadKbArticuloUseCase(repo),
      inject: [KB_ARTICULO_REPOSITORY],
    },
    {
      provide: EliminarKbArticuloUseCase,
      useFactory: (repo: IKbArticuloRepository) => new EliminarKbArticuloUseCase(repo),
      inject: [KB_ARTICULO_REPOSITORY],
    },
    {
      provide: ObtenerKbArticuloUseCase,
      useFactory: (repo: IKbArticuloRepository) => new ObtenerKbArticuloUseCase(repo),
      inject: [KB_ARTICULO_REPOSITORY],
    },
    {
      provide: ListarKbArticulosUseCase,
      useFactory: (repo: IKbArticuloRepository) => new ListarKbArticulosUseCase(repo),
      inject: [KB_ARTICULO_REPOSITORY],
    },
  ],
  exports: [KB_ARTICULO_REPOSITORY],
})
export class KbModule {}
