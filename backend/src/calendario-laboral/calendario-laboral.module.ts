/**
 * CalendarioLaboralModule — provee los puertos de lectura del calendario
 * laboral y los feriados (WU-2, sdd/sla-habil), con sus adaptadores Prisma
 * de MASTER, más el ABM de feriados globales (WU2, sdd/feriados-configurables).
 *
 * Deliberadamente SIN cablear todavía al módulo SLA: eso es WU-3. Este
 * módulo no se importa desde ningún otro todavía.
 *
 * FITNESS RULE: PrismaService y @prisma/client solo pueden importarse desde
 * infrastructure/ (ver `backend/eslint.config.js`).
 *
 * PrismaService llega vía `SharedModule` (`@Global()`) — no se importa acá,
 * mismo patrón que `TiposComponenteModule`.
 *
 * Importa `AuthModule` para poder usar `JwtAuthGuard`/`GlobalAdminGuard` vía
 * `@UseGuards` en `FeriadosController` (D5, mismo patrón que `ClientesModule`
 * con `CicloVigenteController`).
 *
 * Tarea: 2.5, sdd/feriados-configurables.
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CALENDARIO_LABORAL_SEMANAL_REPOSITORY } from './domain/ports/i-calendario-laboral-semanal.repository';
import { FERIADOS_LABORALES_REPOSITORY } from './domain/ports/i-feriados-laborales.repository';
import {
  FERIADO_GLOBAL_REPOSITORY,
  IFeriadoGlobalRepository,
} from './domain/ports/i-feriado-global.repository';
import { PrismaCalendarioLaboralSemanalRepository } from './infrastructure/persistence/prisma/prisma-calendario-laboral-semanal.repository';
import { PrismaFeriadosLaboralesRepository } from './infrastructure/persistence/prisma/prisma-feriados-laborales.repository';
import { PrismaFeriadoGlobalRepository } from './infrastructure/persistence/prisma/prisma-feriado-global.repository';
import { ListarFeriadosGlobalesUseCase } from './application/use-cases/listar-feriados-globales.use-case';
import { CrearFeriadoGlobalUseCase } from './application/use-cases/crear-feriado-global.use-case';
import { EditarFeriadoGlobalUseCase } from './application/use-cases/editar-feriado-global.use-case';
import { EliminarFeriadoGlobalUseCase } from './application/use-cases/eliminar-feriado-global.use-case';
import { FeriadosController } from './interface/controllers/feriados.controller';

@Module({
  imports: [AuthModule],
  controllers: [FeriadosController],
  providers: [
    {
      provide: CALENDARIO_LABORAL_SEMANAL_REPOSITORY,
      useClass: PrismaCalendarioLaboralSemanalRepository,
    },
    { provide: FERIADOS_LABORALES_REPOSITORY, useClass: PrismaFeriadosLaboralesRepository },
    { provide: FERIADO_GLOBAL_REPOSITORY, useClass: PrismaFeriadoGlobalRepository },
    {
      provide: ListarFeriadosGlobalesUseCase,
      useFactory: (repo: IFeriadoGlobalRepository) => new ListarFeriadosGlobalesUseCase(repo),
      inject: [FERIADO_GLOBAL_REPOSITORY],
    },
    {
      provide: CrearFeriadoGlobalUseCase,
      useFactory: (repo: IFeriadoGlobalRepository) => new CrearFeriadoGlobalUseCase(repo),
      inject: [FERIADO_GLOBAL_REPOSITORY],
    },
    {
      provide: EditarFeriadoGlobalUseCase,
      useFactory: (repo: IFeriadoGlobalRepository) => new EditarFeriadoGlobalUseCase(repo),
      inject: [FERIADO_GLOBAL_REPOSITORY],
    },
    {
      provide: EliminarFeriadoGlobalUseCase,
      useFactory: (repo: IFeriadoGlobalRepository) => new EliminarFeriadoGlobalUseCase(repo),
      inject: [FERIADO_GLOBAL_REPOSITORY],
    },
  ],
  exports: [CALENDARIO_LABORAL_SEMANAL_REPOSITORY, FERIADOS_LABORALES_REPOSITORY],
})
export class CalendarioLaboralModule {}
