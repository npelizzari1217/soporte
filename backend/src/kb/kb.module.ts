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
 * KbModule — módulo NestJS de la Ayuda (Fase 4, PR-K).
 *
 * Los artículos son ÚNICOS y GLOBALES: viven en la DB MASTER, no en la del
 * cliente. Por eso este módulo NO depende del tenant — el repositorio recibe
 * PrismaService (cliente master) en vez de TenantContext, y KbController no
 * aplica TenantGuard.
 *
 * Autorización: escritura reservada a ROOT (GlobalAdminGuard por método),
 * lectura gateada por la celda KB:LECTURA (AccionesGuard) con el scope de
 * filas resuelto en el use case por KB:VER_TODOS.
 *
 * Wiring:
 * - Repo: KB_ARTICULO_REPOSITORY → PrismaKbArticuloRepository (master).
 * - Use cases: Crear/Editar/CambiarVisibilidad/Eliminar/Obtener/ListarKb
 *   (K1-K4, todos Result).
 * - Importa AuthModule por los guards de KbController (JwtAuthGuard,
 *   AccionesGuard, GlobalAdminGuard).
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
