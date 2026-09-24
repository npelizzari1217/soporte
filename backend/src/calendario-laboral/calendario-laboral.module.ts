/**
 * CalendarioLaboralModule — provee los puertos de lectura del calendario
 * laboral y los feriados (sdd/sla-habil) que consume `SlaModule`, más los ABM
 * de feriados globales (MASTER, solo ROOT) y de feriados por cliente (base
 * del tenant, ADMINISTRADOR del cliente o ROOT) de sdd/feriados-configurables.
 *
 * La lectura de feriados para el SLA une globales y propios del cliente
 * (`PrismaFeriadosLaboralesRepository`) y falla cerrado si no hay un
 * `TenantContext` activo.
 *
 * FITNESS RULE: PrismaService y @prisma/client solo pueden importarse desde
 * infrastructure/ (ver `backend/eslint.config.js`).
 *
 * PrismaService llega vía `SharedModule` (`@Global()`) — no se importa acá,
 * mismo patrón que `TiposComponenteModule`.
 *
 * Importa `AuthModule` para poder usar `JwtAuthGuard`/`GlobalAdminGuard`/
 * `TenantGuard`/`AdminClienteGuard` vía `@UseGuards` en `FeriadosController`
 * y `FeriadosClienteController` (D5). `TenantContext` la provee `SharedModule`
 * (`@Global()`) — no se importa acá.
 *
 * Tarea: 2.5, 4.4, sdd/feriados-configurables.
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CALENDARIO_LABORAL_SEMANAL_REPOSITORY } from './domain/ports/i-calendario-laboral-semanal.repository';
import { FERIADOS_LABORALES_REPOSITORY } from './domain/ports/i-feriados-laborales.repository';
import {
  FERIADO_GLOBAL_REPOSITORY,
  IFeriadoGlobalRepository,
} from './domain/ports/i-feriado-global.repository';
import {
  FERIADO_CLIENTE_REPOSITORY,
  IFeriadoClienteRepository,
} from './domain/ports/i-feriado-cliente.repository';
import {
  FERIADOS_GLOBALES_CHECKER,
  IFeriadosGlobalesChecker,
} from './domain/ports/i-feriados-globales.checker';
import { PrismaCalendarioLaboralSemanalRepository } from './infrastructure/persistence/prisma/prisma-calendario-laboral-semanal.repository';
import { PrismaFeriadosLaboralesRepository } from './infrastructure/persistence/prisma/prisma-feriados-laborales.repository';
import { PrismaFeriadoGlobalRepository } from './infrastructure/persistence/prisma/prisma-feriado-global.repository';
import { PrismaFeriadoClienteRepository } from './infrastructure/persistence/prisma/prisma-feriado-cliente.repository';
import { FeriadosGlobalesMasterChecker } from './infrastructure/persistence/prisma/feriados-globales-master.checker';
import { ListarFeriadosGlobalesUseCase } from './application/use-cases/listar-feriados-globales.use-case';
import { CrearFeriadoGlobalUseCase } from './application/use-cases/crear-feriado-global.use-case';
import { EditarFeriadoGlobalUseCase } from './application/use-cases/editar-feriado-global.use-case';
import { EliminarFeriadoGlobalUseCase } from './application/use-cases/eliminar-feriado-global.use-case';
import { ListarFeriadosClienteUseCase } from './application/use-cases/listar-feriados-cliente.use-case';
import { CrearFeriadoClienteUseCase } from './application/use-cases/crear-feriado-cliente.use-case';
import { EditarFeriadoClienteUseCase } from './application/use-cases/editar-feriado-cliente.use-case';
import { EliminarFeriadoClienteUseCase } from './application/use-cases/eliminar-feriado-cliente.use-case';
import { FeriadosController } from './interface/controllers/feriados.controller';
import { FeriadosClienteController } from './interface/controllers/feriados-cliente.controller';

@Module({
  imports: [AuthModule],
  controllers: [FeriadosController, FeriadosClienteController],
  providers: [
    {
      provide: CALENDARIO_LABORAL_SEMANAL_REPOSITORY,
      useClass: PrismaCalendarioLaboralSemanalRepository,
    },
    { provide: FERIADOS_LABORALES_REPOSITORY, useClass: PrismaFeriadosLaboralesRepository },
    { provide: FERIADO_GLOBAL_REPOSITORY, useClass: PrismaFeriadoGlobalRepository },
    { provide: FERIADO_CLIENTE_REPOSITORY, useClass: PrismaFeriadoClienteRepository },
    { provide: FERIADOS_GLOBALES_CHECKER, useClass: FeriadosGlobalesMasterChecker },
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
    {
      provide: ListarFeriadosClienteUseCase,
      useFactory: (repo: IFeriadoClienteRepository) => new ListarFeriadosClienteUseCase(repo),
      inject: [FERIADO_CLIENTE_REPOSITORY],
    },
    {
      provide: CrearFeriadoClienteUseCase,
      useFactory: (repo: IFeriadoClienteRepository, checker: IFeriadosGlobalesChecker) =>
        new CrearFeriadoClienteUseCase(repo, checker),
      inject: [FERIADO_CLIENTE_REPOSITORY, FERIADOS_GLOBALES_CHECKER],
    },
    {
      provide: EditarFeriadoClienteUseCase,
      useFactory: (repo: IFeriadoClienteRepository, checker: IFeriadosGlobalesChecker) =>
        new EditarFeriadoClienteUseCase(repo, checker),
      inject: [FERIADO_CLIENTE_REPOSITORY, FERIADOS_GLOBALES_CHECKER],
    },
    {
      provide: EliminarFeriadoClienteUseCase,
      useFactory: (repo: IFeriadoClienteRepository) => new EliminarFeriadoClienteUseCase(repo),
      inject: [FERIADO_CLIENTE_REPOSITORY],
    },
  ],
  exports: [CALENDARIO_LABORAL_SEMANAL_REPOSITORY, FERIADOS_LABORALES_REPOSITORY],
})
export class CalendarioLaboralModule {}
