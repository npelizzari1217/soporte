/**
 * ReportesController — entry point HTTP para la capability de reportes.
 *
 * Rutas (todos GET, solo lectura, sin side effects):
 *   GET /reportes/tickets-por-usuario  → TicketsPorUsuarioUseCase
 *   GET /reportes/tickets-por-tipo     → TicketsPorTipoUseCase
 *   GET /reportes/tickets-por-estado   → TicketsPorEstadoUseCase
 *   GET /reportes/tiempo-resolucion    → TiempoResolucionUseCase
 *
 * Guards a nivel de controlador:
 *   JwtAuthGuard   → valida token JWT
 *   TenantGuard    → resuelve el tenant (cliente_id del JWT o X-Tenant-Id para operador)
 *   AdminOrGlobalGuard → permite solo is_global_admin=true O rol ADMINISTRADOR
 *
 * Query param compartido: cicloId (UUID, opcional).
 *   Omitir = ciclo activo del tenant (resuelto en cada use case).
 *   Sin ciclo activo y sin cicloId → 422 Unprocessable Entity.
 *
 * Aislamiento de tenant: garantizado por TenantGuard + TenantContext.
 * El controlador no conoce el tenant — lo resuelve la infraestructura.
 *
 * Spec ref: reportes (todos los requirements)
 * Tarea: T4.13 (PR4, admin-general)
 */
import {
  Controller,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  UnprocessableEntityException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AdminOrGlobalGuard } from '../../infrastructure/guards/admin-or-global.guard';
import {
  TicketsPorUsuarioUseCase,
  TicketsPorUsuarioResult,
} from '../../application/use-cases/tickets-por-usuario.use-case';
import {
  TicketsPorTipoUseCase,
  TipoConTickets,
} from '../../application/use-cases/tickets-por-tipo.use-case';
import {
  TicketsPorEstadoUseCase,
  EstadoConTickets,
} from '../../application/use-cases/tickets-por-estado.use-case';
import {
  TiempoResolucionUseCase,
  TiempoResolucionResult,
} from '../../application/use-cases/tiempo-resolucion.use-case';
import { NoCicloActivoError } from '../../domain/errors/reportes.errors';
import { ReporteQueryDto } from '../dtos/reporte-query.dto';

/**
 * Traduce errores de dominio a excepciones HTTP para el módulo reportes.
 * NoCicloActivoError → 422 Unprocessable Entity.
 */
function handleReportesError(error: unknown): never {
  if (error instanceof NoCicloActivoError) {
    throw new UnprocessableEntityException(error.message);
  }
  throw error;
}

@UseGuards(JwtAuthGuard, TenantGuard, AdminOrGlobalGuard)
@Controller('reportes')
export class ReportesController {
  constructor(
    private readonly ticketsPorUsuarioUseCase: TicketsPorUsuarioUseCase,
    private readonly ticketsPorTipoUseCase: TicketsPorTipoUseCase,
    private readonly ticketsPorEstadoUseCase: TicketsPorEstadoUseCase,
    private readonly tiempoResolucionUseCase: TiempoResolucionUseCase,
  ) {}

  /**
   * GET /reportes/tickets-por-usuario
   * Tickets del tenant+ciclo agrupados por solicitante Y por asignado (DOS vistas).
   * Los nombres se enriquecen desde master.usuarios en la capa de aplicación.
   *
   * @returns 200 con { porSolicitante: [...], porAsignado: [...] }
   * @throws 422 si no hay ciclo activo y no se proveyó cicloId
   */
  @Get('tickets-por-usuario')
  @HttpCode(HttpStatus.OK)
  async ticketsPorUsuario(@Query() query: ReporteQueryDto): Promise<TicketsPorUsuarioResult> {
    try {
      return await this.ticketsPorUsuarioUseCase.execute({ cicloId: query.cicloId });
    } catch (error) {
      handleReportesError(error);
    }
  }

  /**
   * GET /reportes/tickets-por-tipo
   * Tickets del tenant+ciclo agrupados por tipo de flujo.
   * Los 3 tipos (SOPORTE, COMPRAS, EDILICIA) siempre presentes, incluso con 0.
   *
   * @returns 200 con array de { tipo, totalTickets }
   * @throws 422 si no hay ciclo activo y no se proveyó cicloId
   */
  @Get('tickets-por-tipo')
  @HttpCode(HttpStatus.OK)
  async ticketsPorTipo(@Query() query: ReporteQueryDto): Promise<TipoConTickets[]> {
    try {
      return await this.ticketsPorTipoUseCase.execute({ cicloId: query.cicloId });
    } catch (error) {
      handleReportesError(error);
    }
  }

  /**
   * GET /reportes/tickets-por-estado
   * Tickets del tenant+ciclo agrupados por estado.
   * Todos los estados del catálogo presentes (incluyendo terminales), incluso con 0.
   *
   * @returns 200 con array de { estado, totalTickets }
   * @throws 422 si no hay ciclo activo y no se proveyó cicloId
   */
  @Get('tickets-por-estado')
  @HttpCode(HttpStatus.OK)
  async ticketsPorEstado(@Query() query: ReporteQueryDto): Promise<EstadoConTickets[]> {
    try {
      return await this.ticketsPorEstadoUseCase.execute({ cicloId: query.cicloId });
    } catch (error) {
      handleReportesError(error);
    }
  }

  /**
   * GET /reportes/tiempo-resolucion
   * Tiempo promedio de resolución en días para tickets RESUELTO o SIN_SOLUCION.
   * Excluye RECHAZADO. Solo tickets con fecha_cierre IS NOT NULL.
   *
   * @returns 200 con { promedioDias: number | null, totalResueltos: number }
   * @throws 422 si no hay ciclo activo y no se proveyó cicloId
   */
  @Get('tiempo-resolucion')
  @HttpCode(HttpStatus.OK)
  async tiempoResolucion(@Query() query: ReporteQueryDto): Promise<TiempoResolucionResult> {
    try {
      return await this.tiempoResolucionUseCase.execute({ cicloId: query.cicloId });
    } catch (error) {
      handleReportesError(error);
    }
  }
}
