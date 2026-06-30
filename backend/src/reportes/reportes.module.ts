/**
 * ReportesModule — wiring NestJS del módulo de reportes (PR4, admin-general).
 *
 * Endpoints registrados (GET, solo lectura):
 *   GET /reportes/tickets-por-usuario
 *   GET /reportes/tickets-por-tipo
 *   GET /reportes/tickets-por-estado
 *   GET /reportes/tiempo-resolucion
 *
 * Guards aplicados a nivel de controller:
 *   JwtAuthGuard  → resolución de JWT (exportado por AuthModule)
 *   TenantGuard   → aislamiento de tenant via X-Tenant-Id / cliente_id (exportado por AuthModule)
 *   AdminOrGlobalGuard → solo ADMINISTRADOR o is_global_admin (local a este módulo)
 *
 * Dependencias de infraestructura:
 *   REPORTES_REPOSITORY → PrismaReportesRepository (tenant DB via TenantContext @Global)
 *   USUARIO_REPOSITORY  → PrismaUsuarioRepository  (master DB via PrismaService + MasterContext @Global)
 *
 * Nota DI:
 *   SharedModule es @Global() → PrismaService, TenantContext, MasterContext disponibles
 *   sin importar SharedModule aquí.
 *   Los use cases son plain classes (no @Injectable) instanciados via useFactory.
 *   AdminOrGlobalGuard es @Injectable pero sin dependencias extra — solo precisa estar
 *   declarado como provider para que NestJS lo resuelva cuando UseGuards lo inyecta.
 *
 * Tarea: T4.14 (PR4, admin-general)
 */
import { Module, forwardRef } from '@nestjs/common';

// ─── Port tokens ──────────────────────────────────────────────────────────────
import { REPORTES_REPOSITORY, IReportesRepository } from './domain/ports/i-reportes.repository';
import { USUARIO_REPOSITORY } from '../auth/domain/ports/i-usuario.repository';
import { IUsuarioRepository } from '../auth/domain/ports/i-usuario.repository';

// ─── Infrastructure — repositorios concretos ──────────────────────────────────
import { PrismaReportesRepository } from './infrastructure/persistence/prisma/prisma-reportes.repository';
import { PrismaUsuarioRepository } from '../auth/infrastructure/persistence/prisma/prisma-usuario.repository';

// ─── Infrastructure — guard ───────────────────────────────────────────────────
import { AdminOrGlobalGuard } from './infrastructure/guards/admin-or-global.guard';

// ─── Application — use cases ──────────────────────────────────────────────────
import { TicketsPorUsuarioUseCase } from './application/use-cases/tickets-por-usuario.use-case';
import { TicketsPorTipoUseCase } from './application/use-cases/tickets-por-tipo.use-case';
import { TicketsPorEstadoUseCase } from './application/use-cases/tickets-por-estado.use-case';
import { TiempoResolucionUseCase } from './application/use-cases/tiempo-resolucion.use-case';

// ─── Interface — controller ───────────────────────────────────────────────────
import { ReportesController } from './interface/controllers/reportes.controller';

// ─── AuthModule (JwtAuthGuard + TenantGuard) ─────────────────────────────────
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    // AuthModule exporta: TOKEN_SERVICE, JwtAuthGuard, GlobalAdminGuard, TenantGuard, PermissionsGuard.
    // ReportesController los usa con @UseGuards(JwtAuthGuard, TenantGuard, AdminOrGlobalGuard).
    // AuthModule NO importa ReportesModule → sin circularidad.
    forwardRef(() => AuthModule),
  ],
  controllers: [ReportesController],
  providers: [
    // ─── Repositorio de reportes (tenant DB) ─────────────────────────────────
    // PrismaReportesRepository inyecta TenantContext (@Global desde SharedModule).
    {
      provide: REPORTES_REPOSITORY,
      useClass: PrismaReportesRepository,
    },

    // ─── Repositorio de usuarios (master DB) ─────────────────────────────────
    // PrismaUsuarioRepository inyecta PrismaService + MasterContext (@Global desde SharedModule).
    // Se declara localmente porque AuthModule no exporta USUARIO_REPOSITORY.
    {
      provide: USUARIO_REPOSITORY,
      useClass: PrismaUsuarioRepository,
    },

    // ─── Guard (sin dependencias extra) ──────────────────────────────────────
    AdminOrGlobalGuard,

    // ─── Use Cases (plain classes — instanciados via useFactory) ─────────────

    {
      provide: TicketsPorUsuarioUseCase,
      useFactory: (reportesRepo: IReportesRepository, usuarioRepo: IUsuarioRepository) =>
        new TicketsPorUsuarioUseCase(reportesRepo, usuarioRepo),
      inject: [REPORTES_REPOSITORY, USUARIO_REPOSITORY],
    },

    {
      provide: TicketsPorTipoUseCase,
      useFactory: (reportesRepo: IReportesRepository) => new TicketsPorTipoUseCase(reportesRepo),
      inject: [REPORTES_REPOSITORY],
    },

    {
      provide: TicketsPorEstadoUseCase,
      useFactory: (reportesRepo: IReportesRepository) => new TicketsPorEstadoUseCase(reportesRepo),
      inject: [REPORTES_REPOSITORY],
    },

    {
      provide: TiempoResolucionUseCase,
      useFactory: (reportesRepo: IReportesRepository) => new TiempoResolucionUseCase(reportesRepo),
      inject: [REPORTES_REPOSITORY],
    },
  ],
})
export class ReportesModule {}
