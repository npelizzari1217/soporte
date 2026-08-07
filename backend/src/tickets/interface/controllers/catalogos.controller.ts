/**
 * CatalogosController — entry point HTTP del CRUD editable de catálogos
 * (T2, PR11): `tipos_ticket` y `prioridades`. `estados` es FIJO — sin rutas
 * de escritura acá (spec T1: "no hay endpoint de alta/baja/edición de
 * estados", ni siquiera para ADMINISTRADOR).
 *
 * Rutas de escritura (permiso `catalogo:gestionar`, EXCLUSIVO ADMINISTRADOR):
 *   POST  /catalogos/tipos-ticket             → CrearTipoTicketUseCase
 *   PATCH /catalogos/tipos-ticket/:id         → EditarTipoTicketUseCase
 *   PATCH /catalogos/tipos-ticket/:id/estado  → CambiarEstadoActivoTipoTicketUseCase
 *   POST  /catalogos/prioridades              → CrearPrioridadUseCase
 *   PATCH /catalogos/prioridades/:id          → EditarPrioridadUseCase
 *   PATCH /catalogos/prioridades/:id/estado   → CambiarEstadoActivoPrioridadUseCase
 *
 * Rutas de lectura (G1, sdd/beta-frontend — CUALQUIER usuario autenticado del
 * tenant, SIN `@RequirePermissions`: son catálogos que alimentan selects/
 * filtros/labels en toda la UI, no solo la vista admin de catálogos):
 *   GET   /catalogos/tipos-ticket   → ListarTiposTicketUseCase
 *   GET   /catalogos/prioridades    → ListarPrioridadesUseCase
 *   GET   /catalogos/estados        → ListarEstadosUseCase
 *   GET   /catalogos/tipo-operacion → ListarTiposOperacionUseCase
 *
 * Las rutas de escritura desvían la alternativa original de design ADR-2
 * (reusar `cliente:gestionar`) por decisión explícita de esta sesión — ver
 * apply-progress PR2/PR11.
 *
 * El controller no tiene lógica de negocio: solo traduce HTTP ↔ use case y
 * mapea `DomainError` → `HttpException`.
 *
 * Ref spec: sdd/tickets-core/spec T2; sdd/beta-frontend/spec §3 G1.
 * Ref design: ADR-2, ADR-4 (tickets-core); ADR-5 (beta-frontend). Tarea: T11.3.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { CrearTipoTicketUseCase } from '../../application/use-cases/crear-tipo-ticket.use-case';
import { EditarTipoTicketUseCase } from '../../application/use-cases/editar-tipo-ticket.use-case';
import { CambiarEstadoActivoTipoTicketUseCase } from '../../application/use-cases/cambiar-estado-activo-tipo-ticket.use-case';
import { CrearPrioridadUseCase } from '../../application/use-cases/crear-prioridad.use-case';
import { EditarPrioridadUseCase } from '../../application/use-cases/editar-prioridad.use-case';
import { CambiarEstadoActivoPrioridadUseCase } from '../../application/use-cases/cambiar-estado-activo-prioridad.use-case';
import { ListarTiposTicketUseCase } from '../../application/use-cases/listar-tipos-ticket.use-case';
import { ListarPrioridadesUseCase } from '../../application/use-cases/listar-prioridades.use-case';
import { ListarEstadosUseCase } from '../../application/use-cases/listar-estados.use-case';
import { ListarTiposOperacionUseCase } from '../../application/use-cases/listar-tipos-operacion.use-case';
import {
  CambiarEstadoActivoDto,
  CreatePrioridadDto,
  CreateTipoTicketDto,
  EditPrioridadDto,
  EditTipoTicketDto,
  EstadoResponseDto,
  PrioridadResponseDto,
  TipoOperacionResponseDto,
  TipoTicketResponseDto,
  toEstadoResponseDto,
  toPrioridadResponseDto,
  toTipoOperacionResponseDto,
  toTipoTicketResponseDto,
} from '../dtos/catalogo.dto';
import {
  TipoTicketNoEncontradoError,
  PrioridadNoEncontradaError,
} from '../../domain/errors/tickets.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { RequirePermissions } from '../../../auth/infrastructure/guards/decorators';
import { DomainError } from '../../../shared/domain/result';

const PERMISO_CATALOGO_GESTIONAR = 'catalogo:gestionar';

/** Mapea un `DomainError` de los use cases de catálogos a la `HttpException` correspondiente. */
function toHttpException(error: DomainError): NotFoundException | UnprocessableEntityException {
  if (error instanceof TipoTicketNoEncontradoError || error instanceof PrioridadNoEncontradaError) {
    return new NotFoundException(error.message);
  }
  // TipoTicketCodigoDuplicadoError, PrefijoTipoTicketColisionError,
  // TipoTicketDesconocidoError, PrioridadCodigoDuplicadaError → 422.
  return new UnprocessableEntityException(error.message);
}

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@RequirePermissions(PERMISO_CATALOGO_GESTIONAR)
@Controller('catalogos')
export class CatalogosController {
  constructor(
    private readonly crearTipoTicketUseCase: CrearTipoTicketUseCase,
    private readonly editarTipoTicketUseCase: EditarTipoTicketUseCase,
    private readonly cambiarEstadoActivoTipoTicketUseCase: CambiarEstadoActivoTipoTicketUseCase,
    private readonly crearPrioridadUseCase: CrearPrioridadUseCase,
    private readonly editarPrioridadUseCase: EditarPrioridadUseCase,
    private readonly cambiarEstadoActivoPrioridadUseCase: CambiarEstadoActivoPrioridadUseCase,
    private readonly listarTiposTicketUseCase: ListarTiposTicketUseCase,
    private readonly listarPrioridadesUseCase: ListarPrioridadesUseCase,
    private readonly listarEstadosUseCase: ListarEstadosUseCase,
    private readonly listarTiposOperacionUseCase: ListarTiposOperacionUseCase,
  ) {}

  // ─── lectura (G1, sdd/beta-frontend — cualquier usuario autenticado) ──────
  // Declaradas ANTES de las rutas de escritura con `:id` para que Nest
  // matchee `/tipos-ticket` y `/prioridades` sin parámetro — no colisionan
  // igual (mismo criterio que EquiposController con `/equipos/tipos-componente`).

  /**
   * GET /catalogos/tipos-ticket — catálogo activo, SIN gate de permiso.
   * `@RequirePermissions()` vacío ANULA el requisito `catalogo:gestionar`
   * del controller (`Reflector.getAllAndOverride` prioriza metadata de
   * handler sobre metadata de clase) — necesario porque las rutas de
   * escritura de ESTE mismo controller sí lo exigen a nivel de clase.
   */
  @Get('tipos-ticket')
  @RequirePermissions()
  async listarTiposTicket(): Promise<TipoTicketResponseDto[]> {
    const result = await this.listarTiposTicketUseCase.execute();
    return result.getValue().map(toTipoTicketResponseDto);
  }

  /** GET /catalogos/prioridades — catálogo activo, SIN gate de permiso (ver nota arriba). */
  @Get('prioridades')
  @RequirePermissions()
  async listarPrioridades(): Promise<PrioridadResponseDto[]> {
    const result = await this.listarPrioridadesUseCase.execute();
    return result.getValue().map(toPrioridadResponseDto);
  }

  /** GET /catalogos/estados — catálogo FIJO activo, SIN gate de permiso (ver nota arriba). */
  @Get('estados')
  @RequirePermissions()
  async listarEstados(): Promise<EstadoResponseDto[]> {
    const result = await this.listarEstadosUseCase.execute();
    return result.getValue().map(toEstadoResponseDto);
  }

  /** GET /catalogos/tipo-operacion — catálogo FIJO activo, SIN gate de permiso (ver nota arriba). */
  @Get('tipo-operacion')
  @RequirePermissions()
  async listarTiposOperacion(): Promise<TipoOperacionResponseDto[]> {
    const result = await this.listarTiposOperacionUseCase.execute();
    return result.getValue().map(toTipoOperacionResponseDto);
  }

  // ─── tipos-ticket ────────────────────────────────────────────────────────

  /**
   * POST /catalogos/tipos-ticket
   * @throws 403 sin `catalogo:gestionar`
   * @throws 422 codigo duplicado, codigo degenerado, o prefijo derivado (ADR-4) en colisión
   */
  @Post('tipos-ticket')
  @HttpCode(HttpStatus.CREATED)
  async crearTipoTicket(@Body() dto: CreateTipoTicketDto): Promise<TipoTicketResponseDto> {
    const result = await this.crearTipoTicketUseCase.execute(dto);
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toTipoTicketResponseDto(result.getValue());
  }

  /**
   * PATCH /catalogos/tipos-ticket/:id
   * @throws 403 sin `catalogo:gestionar`
   * @throws 404 tipo inexistente
   * @throws 422 codigo duplicado o colisión de prefijo (si `codigo` cambia)
   */
  @Patch('tipos-ticket/:id')
  async editarTipoTicket(
    @Param('id') id: string,
    @Body() dto: EditTipoTicketDto,
  ): Promise<TipoTicketResponseDto> {
    const result = await this.editarTipoTicketUseCase.execute({ id, ...dto });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toTipoTicketResponseDto(result.getValue());
  }

  /**
   * PATCH /catalogos/tipos-ticket/:id/estado
   * Activa (`activo:true`) o da de baja/soft-delete (`activo:false`) el
   * tipo. Dar de baja NO rompe tickets existentes que lo referencian.
   * @throws 403 sin `catalogo:gestionar`
   * @throws 404 tipo inexistente
   */
  @Patch('tipos-ticket/:id/estado')
  async cambiarEstadoActivoTipoTicket(
    @Param('id') id: string,
    @Body() dto: CambiarEstadoActivoDto,
  ): Promise<TipoTicketResponseDto> {
    const result = await this.cambiarEstadoActivoTipoTicketUseCase.execute({
      id,
      activo: dto.activo,
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toTipoTicketResponseDto(result.getValue());
  }

  // ─── prioridades ─────────────────────────────────────────────────────────

  /**
   * POST /catalogos/prioridades
   * @throws 403 sin `catalogo:gestionar`
   * @throws 422 codigo duplicado
   */
  @Post('prioridades')
  @HttpCode(HttpStatus.CREATED)
  async crearPrioridad(@Body() dto: CreatePrioridadDto): Promise<PrioridadResponseDto> {
    const result = await this.crearPrioridadUseCase.execute(dto);
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toPrioridadResponseDto(result.getValue());
  }

  /**
   * PATCH /catalogos/prioridades/:id
   * @throws 403 sin `catalogo:gestionar`
   * @throws 404 prioridad inexistente
   * @throws 422 codigo duplicado (si `codigo` cambia)
   */
  @Patch('prioridades/:id')
  async editarPrioridad(
    @Param('id') id: string,
    @Body() dto: EditPrioridadDto,
  ): Promise<PrioridadResponseDto> {
    const result = await this.editarPrioridadUseCase.execute({ id, ...dto });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toPrioridadResponseDto(result.getValue());
  }

  /**
   * PATCH /catalogos/prioridades/:id/estado
   * @throws 403 sin `catalogo:gestionar`
   * @throws 404 prioridad inexistente
   */
  @Patch('prioridades/:id/estado')
  async cambiarEstadoActivoPrioridad(
    @Param('id') id: string,
    @Body() dto: CambiarEstadoActivoDto,
  ): Promise<PrioridadResponseDto> {
    const result = await this.cambiarEstadoActivoPrioridadUseCase.execute({
      id,
      activo: dto.activo,
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toPrioridadResponseDto(result.getValue());
  }
}
