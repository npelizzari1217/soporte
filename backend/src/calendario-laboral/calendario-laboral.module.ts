/**
 * CalendarioLaboralModule — provee los puertos de lectura del calendario
 * laboral y los feriados (sdd/sla-habil) que consume `SlaModule`, más los ABM
 * de feriados globales (MASTER, solo ROOT) y de feriados por cliente (base
 * del tenant, ADMINISTRADOR del cliente o ROOT) de sdd/feriados-configurables.
 *
 * El calendario laboral es por cliente (tenant, desde
 * sdd/horario-laboral-por-cliente) y la lectura de feriados para el SLA une
 * globales y propios del cliente (`PrismaFeriadosLaboralesRepository`);
 * ambos fallan cerrado si no hay un `TenantContext` activo.
 *
 * FITNESS RULE: PrismaService y @prisma/client solo pueden importarse desde
 * infrastructure/ (ver `backend/eslint.config.js`).
 *
 * PrismaService llega vía `SharedModule` (`@Global()`) — no se importa acá.
 *
 * Importa `AuthModule` para poder usar `JwtAuthGuard`/`GlobalAdminGuard`/
 * `TenantGuard`/`AdminClienteGuard` vía `@UseGuards` en `FeriadosController`
 * y `FeriadosClienteController` (D5). `TenantContext` la provee `SharedModule`
 * (`@Global()`) — no se importa acá.
 *
 * Horario propio por usuario (odd/tasks/tiempo-tecnico.md, T1):
 * `HorarioLaboralUsuarioController` y `ResolverHorarioLaboralUsuarioService`,
 * exportado para medir a cada técnico con su horario o, si no tiene, con el
 * del tenant. La pertenencia del usuario al tenant la valida
 * `UsuarioMasterChecker` (de `tickets`), registrado acá como provider local:
 * `TicketsModule` importa este módulo, así que importarlo de vuelta haría un
 * ciclo.
 *
 * Tarea: 2.5, 4.4, sdd/feriados-configurables.
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CALENDARIO_LABORAL_SEMANAL_REPOSITORY } from './domain/ports/i-calendario-laboral-semanal.repository';
import { HORARIO_LABORAL_ESCRITURA_REPOSITORY } from './domain/ports/i-horario-laboral-escritura.repository';
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
import { FeriadosGlobalesCache } from './infrastructure/persistence/feriados-globales.cache';
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
import { HorarioLaboralController } from './interface/controllers/horario-laboral.controller';
import {
  ITenantTransactionRunner,
  TENANT_TX_RUNNER,
} from '../shared/infrastructure/persistence/tenant-transaction-runner';
import { ICalendarioLaboralSemanalRepository } from './domain/ports/i-calendario-laboral-semanal.repository';
import { IHorarioLaboralEscrituraRepository } from './domain/ports/i-horario-laboral-escritura.repository';
import { ObtenerHorarioLaboralUseCase } from './application/use-cases/obtener-horario-laboral.use-case';
import { GuardarHorarioLaboralUseCase } from './application/use-cases/guardar-horario-laboral.use-case';
import {
  HORARIO_LABORAL_USUARIO_REPOSITORY,
  IHorarioLaboralUsuarioRepository,
} from './domain/ports/i-horario-laboral-usuario.repository';
import { PrismaHorarioLaboralUsuarioRepository } from './infrastructure/persistence/prisma/prisma-horario-laboral-usuario.repository';
import { ResolverHorarioLaboralUsuarioService } from './domain/services/resolver-horario-laboral-usuario.service';
import { ObtenerHorarioLaboralUsuarioUseCase } from './application/use-cases/obtener-horario-laboral-usuario.use-case';
import { GuardarHorarioLaboralUsuarioUseCase } from './application/use-cases/guardar-horario-laboral-usuario.use-case';
import { BorrarHorarioLaboralUsuarioUseCase } from './application/use-cases/borrar-horario-laboral-usuario.use-case';
import { HorarioLaboralUsuarioController } from './interface/controllers/horario-laboral-usuario.controller';
import {
  IUsuarioMasterChecker,
  USUARIO_MASTER_CHECKER,
} from '../tickets/domain/ports/i-usuario-master.checker';
import { UsuarioMasterChecker } from '../tickets/infrastructure/persistence/prisma/usuario-master.checker';

@Module({
  imports: [AuthModule],
  controllers: [
    FeriadosController,
    FeriadosClienteController,
    HorarioLaboralController,
    HorarioLaboralUsuarioController,
  ],
  providers: [
    {
      // TenantContext llega vía SharedModule (@Global) — desde WU-3
      // (sdd/horario-laboral-por-cliente) el repo ya no depende de
      // PrismaService, Nest lo resuelve solo por el constructor.
      provide: CALENDARIO_LABORAL_SEMANAL_REPOSITORY,
      useClass: PrismaCalendarioLaboralSemanalRepository,
    },
    {
      // Alias sobre el MISMO provider (WU-5, sdd/horario-laboral-por-cliente,
      // tarea 5.3): `PrismaCalendarioLaboralSemanalRepository` implementa los
      // dos puertos (ISP), pero cada caso de uso lo pide por su propio token.
      provide: HORARIO_LABORAL_ESCRITURA_REPOSITORY,
      useExisting: CALENDARIO_LABORAL_SEMANAL_REPOSITORY,
    },
    FeriadosGlobalesCache,
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
    {
      provide: ObtenerHorarioLaboralUseCase,
      useFactory: (repo: ICalendarioLaboralSemanalRepository) =>
        new ObtenerHorarioLaboralUseCase(repo),
      inject: [CALENDARIO_LABORAL_SEMANAL_REPOSITORY],
    },
    {
      provide: GuardarHorarioLaboralUseCase,
      useFactory: (
        lecturaRepo: ICalendarioLaboralSemanalRepository,
        escrituraRepo: IHorarioLaboralEscrituraRepository,
        txRunner: ITenantTransactionRunner,
      ) => new GuardarHorarioLaboralUseCase(lecturaRepo, escrituraRepo, txRunner),
      inject: [
        CALENDARIO_LABORAL_SEMANAL_REPOSITORY,
        HORARIO_LABORAL_ESCRITURA_REPOSITORY,
        TENANT_TX_RUNNER,
      ],
    },
    {
      provide: HORARIO_LABORAL_USUARIO_REPOSITORY,
      useClass: PrismaHorarioLaboralUsuarioRepository,
    },
    // Provider local, no exportado: ver el JSDoc del módulo (ciclo con TicketsModule).
    { provide: USUARIO_MASTER_CHECKER, useClass: UsuarioMasterChecker },
    {
      provide: ResolverHorarioLaboralUsuarioService,
      useFactory: (
        usuarioRepo: IHorarioLaboralUsuarioRepository,
        clienteRepo: ICalendarioLaboralSemanalRepository,
      ) => new ResolverHorarioLaboralUsuarioService(usuarioRepo, clienteRepo),
      inject: [HORARIO_LABORAL_USUARIO_REPOSITORY, CALENDARIO_LABORAL_SEMANAL_REPOSITORY],
    },
    {
      provide: ObtenerHorarioLaboralUsuarioUseCase,
      useFactory: (
        checker: IUsuarioMasterChecker,
        resolver: ResolverHorarioLaboralUsuarioService,
      ) => new ObtenerHorarioLaboralUsuarioUseCase(checker, resolver),
      inject: [USUARIO_MASTER_CHECKER, ResolverHorarioLaboralUsuarioService],
    },
    {
      provide: GuardarHorarioLaboralUsuarioUseCase,
      useFactory: (
        checker: IUsuarioMasterChecker,
        repo: IHorarioLaboralUsuarioRepository,
        txRunner: ITenantTransactionRunner,
        resolver: ResolverHorarioLaboralUsuarioService,
      ) => new GuardarHorarioLaboralUsuarioUseCase(checker, repo, txRunner, resolver),
      inject: [
        USUARIO_MASTER_CHECKER,
        HORARIO_LABORAL_USUARIO_REPOSITORY,
        TENANT_TX_RUNNER,
        ResolverHorarioLaboralUsuarioService,
      ],
    },
    {
      provide: BorrarHorarioLaboralUsuarioUseCase,
      useFactory: (
        checker: IUsuarioMasterChecker,
        repo: IHorarioLaboralUsuarioRepository,
        resolver: ResolverHorarioLaboralUsuarioService,
      ) => new BorrarHorarioLaboralUsuarioUseCase(checker, repo, resolver),
      inject: [
        USUARIO_MASTER_CHECKER,
        HORARIO_LABORAL_USUARIO_REPOSITORY,
        ResolverHorarioLaboralUsuarioService,
      ],
    },
  ],
  exports: [
    CALENDARIO_LABORAL_SEMANAL_REPOSITORY,
    FERIADOS_LABORALES_REPOSITORY,
    ResolverHorarioLaboralUsuarioService,
  ],
})
export class CalendarioLaboralModule {}
