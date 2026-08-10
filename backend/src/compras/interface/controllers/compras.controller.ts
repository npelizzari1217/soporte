/**
 * ComprasController — entry point HTTP del módulo `compras/` (F3-C1..C6).
 *
 * Rutas:
 *   POST   /compras                                              → CrearTicketCompraUseCase       [ticket:crear]
 *   GET    /compras                                               → ListarComprasUseCase           (autenticado)
 *   POST   /compras/:compraId/items                                → AgregarItemCompraUseCase       [compra:gestionar]
 *   DELETE /compras/:compraId/items/:itemId                        → EliminarItemCompraUseCase      [compra:gestionar]
 *   POST   /compras/:compraId/presupuestos                         → AgregarPresupuestoUseCase      [compra:gestionar]
 *   POST   /compras/:compraId/presupuestos/:presupuestoId/seleccionar → SeleccionarPresupuestoUseCase [compra:gestionar]
 *   POST   /compras/:compraId/presupuestos/:presupuestoId/adjuntos → AdjuntarPresupuestoUseCase     [compra:gestionar]
 *   POST   /compras/:id/aprobar                                    → AprobarCompraUseCase           [compra:aprobar]
 *   POST   /compras/:id/rechazar                                   → RechazarCompraUseCase          [ticket:rechazar]
 *
 * Convención de identificadores (F3-C6, ver JSDoc de `compras.dto.ts`):
 * `:compraId` = id del satélite `ticket_compra`; `:id` (aprobar/rechazar)
 * = id del `Ticket` base (los use cases de decisión reciben `ticketId`).
 *
 * Guards a nivel de controller: `JwtAuthGuard` + `TenantGuard` +
 * `PermissionsGuard` (mismo patrón que `TicketsController`). `GET /compras`
 * NO declara `@RequirePermissions` — cualquier usuario autenticado del
 * tenant puede listar (mismo criterio que `GET /tickets`).
 *
 * `FileInterceptor('archivo')` en el endpoint de adjuntos usa
 * `memoryStorage` por default (binario en `file.buffer`) + `validarAdjunto`
 * (reusa el pipe de `tickets/`, Fase 2 T10.1) ANTES de invocar el use case.
 *
 * Tarea: T4.6, T5.7.
 */
import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UnprocessableEntityException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { ModulosGuard } from '../../../auth/infrastructure/guards/modulos.guard';
import {
  CurrentUser,
  RequireModulo,
  RequirePermissions,
} from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { DomainError } from '../../../shared/domain/result';
import { validarAdjunto } from '../../../tickets/interface/pipes/validar-archivo-adjunto';
import {
  toArchivoResponseDto,
  ArchivoResponseDto,
} from '../../../tickets/interface/dtos/ticket.dto';
import {
  TicketNoEncontradoError,
  TipoTicketNoEncontradoError,
  PrioridadNoEncontradaError,
  SolicitanteInvalidoError,
  SinCicloActivoError,
  SecuenciaAgotadaError,
  TransicionInvalidaError,
} from '../../../tickets/domain/errors/tickets.errors';

import { CrearTicketCompraUseCase } from '../../application/use-cases/crear-ticket-compra.use-case';
import { ListarComprasUseCase } from '../../application/use-cases/listar-compras.use-case';
import { ObtenerCompraUseCase } from '../../application/use-cases/obtener-compra.use-case';
import { AgregarItemCompraUseCase } from '../../application/use-cases/agregar-item-compra.use-case';
import { EliminarItemCompraUseCase } from '../../application/use-cases/eliminar-item-compra.use-case';
import { AgregarPresupuestoUseCase } from '../../application/use-cases/agregar-presupuesto.use-case';
import { SeleccionarPresupuestoUseCase } from '../../application/use-cases/seleccionar-presupuesto.use-case';
import { AdjuntarPresupuestoUseCase } from '../../application/use-cases/adjuntar-presupuesto.use-case';
import { AprobarCompraUseCase } from '../../application/use-cases/aprobar-compra.use-case';
import { RechazarCompraUseCase } from '../../application/use-cases/rechazar-compra.use-case';

import {
  CompraNoEncontradaError,
  CompraYaDecididaError,
  MotivoRechazoRequeridoError,
  MonedaInvalidaError,
  MontoInvalidoError,
  CantidadInvalidaError,
  PresupuestoNoEncontradoError,
  ItemNoEncontradoError,
} from '../../domain/errors/compras.errors';

import {
  CompraDetalleResponseDto,
  CreateItemCompraHttpDto,
  CreatePresupuestoHttpDto,
  CreateTicketCompraHttpDto,
  ItemCompraResponseDto,
  PresupuestoResponseDto,
  RechazarCompraHttpDto,
  TicketCompraConTicketResponseDto,
  toCompraDetalleResponseDto,
  toItemCompraResponseDto,
  toPresupuestoResponseDto,
  toTicketCompraResponseDto,
} from '../dtos/compras.dto';

/** Mapea un `DomainError` de los use cases de compras a la `HttpException` correspondiente. */
function toHttpException(
  error: DomainError,
): NotFoundException | UnprocessableEntityException | ConflictException {
  if (
    error instanceof TicketNoEncontradoError ||
    error instanceof CompraNoEncontradaError ||
    error instanceof PresupuestoNoEncontradoError ||
    error instanceof ItemNoEncontradoError
  ) {
    return new NotFoundException(error.message);
  }
  if (error instanceof SinCicloActivoError || error instanceof SecuenciaAgotadaError) {
    return new ConflictException(error.message);
  }
  if (
    error instanceof TipoTicketNoEncontradoError ||
    error instanceof PrioridadNoEncontradaError ||
    error instanceof SolicitanteInvalidoError ||
    error instanceof TransicionInvalidaError ||
    error instanceof CompraYaDecididaError ||
    error instanceof MotivoRechazoRequeridoError ||
    error instanceof MonedaInvalidaError ||
    error instanceof MontoInvalidoError ||
    error instanceof CantidadInvalidaError
  ) {
    return new UnprocessableEntityException(error.message);
  }
  // Deviación de diseño no mapeada explícitamente: 422 por defecto (nunca
  // 500 silencioso para un DomainError, que por definición es un fallo esperado).
  return new UnprocessableEntityException(error.message);
}

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, ModulosGuard)
@RequireModulo('COMPRAS')
@Controller('compras')
export class ComprasController {
  constructor(
    private readonly crearTicketCompraUseCase: CrearTicketCompraUseCase,
    private readonly listarComprasUseCase: ListarComprasUseCase,
    private readonly obtenerCompraUseCase: ObtenerCompraUseCase,
    private readonly agregarItemCompraUseCase: AgregarItemCompraUseCase,
    private readonly eliminarItemCompraUseCase: EliminarItemCompraUseCase,
    private readonly agregarPresupuestoUseCase: AgregarPresupuestoUseCase,
    private readonly seleccionarPresupuestoUseCase: SeleccionarPresupuestoUseCase,
    private readonly adjuntarPresupuestoUseCase: AdjuntarPresupuestoUseCase,
    private readonly aprobarCompraUseCase: AprobarCompraUseCase,
    private readonly rechazarCompraUseCase: RechazarCompraUseCase,
  ) {}

  /**
   * POST /compras
   * Crea un ticket de compra (ticket base + satélite `ticket_compra`, ADR-3).
   * `solicitanteId`/`autorId` = JWT.sub; `anio` lo resuelve el servidor.
   * @throws 409 sin ciclo activo
   * @throws 422 solicitante inválido
   */
  @Post()
  @RequirePermissions('ticket:crear')
  @HttpCode(HttpStatus.CREATED)
  async crear(
    @Body() dto: CreateTicketCompraHttpDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TicketCompraConTicketResponseDto> {
    const result = await this.crearTicketCompraUseCase.execute({
      titulo: dto.titulo,
      descripcion: dto.descripcion ?? null,
      tipoId: dto.tipoId,
      prioridadId: dto.prioridadId,
      solicitanteId: user.sub,
      clienteId: user.cliente_id as string,
      autorId: user.sub,
      anio: new Date().getFullYear(),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const { ticket, ticketCompra } = result.getValue();
    return toTicketCompraResponseDto(ticket, ticketCompra);
  }

  /**
   * GET /compras
   * Lista los tickets de compra del tenant (ticket base + satélite).
   */
  @Get()
  async listar(): Promise<TicketCompraConTicketResponseDto[]> {
    const result = await this.listarComprasUseCase.execute();
    return result
      .getValue()
      .map(({ ticket, ticketCompra }) => toTicketCompraResponseDto(ticket, ticketCompra));
  }

  /**
   * GET /compras/:id
   * Detalle de un ticket de compra — `:id` = id del `Ticket` BASE (mismo
   * criterio que aprobar/rechazar). Embebe items + presupuestos activos
   * (sdd/beta-frontend item 1 — cierra G7).
   * @throws 404 ticket inexistente, o no es de tipo COMPRAS (sin satélite)
   */
  @Get(':id')
  async obtener(@Param('id') id: string): Promise<CompraDetalleResponseDto> {
    const result = await this.obtenerCompraUseCase.execute(id);
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toCompraDetalleResponseDto(result.getValue());
  }

  /**
   * POST /compras/:compraId/items
   * Agrega un ítem al ticket de compra.
   * @throws 404 ticket_compra inexistente
   * @throws 422 cantidad <= 0
   */
  @Post(':compraId/items')
  @RequirePermissions('compra:gestionar')
  @HttpCode(HttpStatus.CREATED)
  async agregarItem(
    @Param('compraId') compraId: string,
    @Body() dto: CreateItemCompraHttpDto,
  ): Promise<ItemCompraResponseDto> {
    const result = await this.agregarItemCompraUseCase.execute({
      ticketCompraId: compraId,
      descripcion: dto.descripcion,
      cantidad: dto.cantidad,
      unidad: dto.unidad ?? null,
      precioUnitarioRef: dto.precioUnitarioRef ?? null,
      observaciones: dto.observaciones ?? null,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toItemCompraResponseDto(result.getValue());
  }

  /**
   * DELETE /compras/:compraId/items/:itemId
   * Baja lógica (soft delete) de un ítem de compra.
   * @throws 404 ítem inexistente
   */
  @Delete(':compraId/items/:itemId')
  @RequirePermissions('compra:gestionar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminarItem(
    @Param('compraId') _compraId: string,
    @Param('itemId') itemId: string,
  ): Promise<void> {
    const result = await this.eliminarItemCompraUseCase.execute({ itemId });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
  }

  /**
   * POST /compras/:compraId/presupuestos
   * Agrega una cotización de proveedor.
   * @throws 404 ticket_compra inexistente
   * @throws 422 moneda/monto inválidos
   */
  @Post(':compraId/presupuestos')
  @RequirePermissions('compra:gestionar')
  @HttpCode(HttpStatus.CREATED)
  async agregarPresupuesto(
    @Param('compraId') compraId: string,
    @Body() dto: CreatePresupuestoHttpDto,
  ): Promise<PresupuestoResponseDto> {
    const result = await this.agregarPresupuestoUseCase.execute({
      ticketCompraId: compraId,
      proveedor: dto.proveedor,
      montoTotal: dto.montoTotal,
      moneda: dto.moneda,
      fechaCotizacion: new Date(dto.fechaCotizacion),
      observaciones: dto.observaciones ?? null,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toPresupuestoResponseDto(result.getValue());
  }

  /**
   * POST /compras/:compraId/presupuestos/:presupuestoId/seleccionar
   * Marca un presupuesto como el ganador (swap atómico, ADR-7).
   * @throws 404 presupuesto inexistente o de otro ticket_compra
   */
  @Post(':compraId/presupuestos/:presupuestoId/seleccionar')
  @RequirePermissions('compra:gestionar')
  @HttpCode(HttpStatus.OK)
  async seleccionarPresupuesto(
    @Param('compraId') compraId: string,
    @Param('presupuestoId') presupuestoId: string,
  ): Promise<PresupuestoResponseDto> {
    const result = await this.seleccionarPresupuestoUseCase.execute({
      presupuestoId,
      ticketCompraId: compraId,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toPresupuestoResponseDto(result.getValue());
  }

  /**
   * POST /compras/:compraId/presupuestos/:presupuestoId/adjuntos
   * Sube un adjunto de cotización (ADR-8).
   * @throws 404 presupuesto inexistente
   * @throws 422 archivo ausente, tamaño/mime inválido
   */
  @Post(':compraId/presupuestos/:presupuestoId/adjuntos')
  @RequirePermissions('compra:gestionar')
  @UseInterceptors(FileInterceptor('archivo'))
  async adjuntarPresupuesto(
    @Param('presupuestoId') presupuestoId: string,
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ArchivoResponseDto> {
    validarAdjunto(file);
    const archivo = file as Express.Multer.File;

    const result = await this.adjuntarPresupuestoUseCase.execute({
      presupuestoId,
      nombreOriginal: archivo.originalname,
      mimeType: archivo.mimetype,
      tamanoBytes: BigInt(archivo.size),
      buffer: archivo.buffer,
      subidoPorId: user.sub,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toArchivoResponseDto(result.getValue());
  }

  /**
   * POST /compras/:id/aprobar
   * Aprueba la compra en un solo paso (ADR-1) — `:id` = id del `Ticket` base.
   * NUNCA cambia el estado del ticket. `aprobadoPorId` viene del JWT.
   * @throws 404 ticket o ticket_compra inexistente
   * @throws 422 ya decidida (doble aprobación)
   */
  @Post(':id/aprobar')
  @RequirePermissions('compra:aprobar')
  @HttpCode(HttpStatus.OK)
  async aprobar(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TicketCompraConTicketResponseDto> {
    const result = await this.aprobarCompraUseCase.execute({
      ticketId: id,
      aprobadoPorId: user.sub,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const { ticket, ticketCompra } = result.getValue();
    return toTicketCompraResponseDto(ticket, ticketCompra);
  }

  /**
   * POST /compras/:id/rechazar
   * Rechaza la compra: satélite + ticket→CANCELADO (ADR-2) — `:id` = id
   * del `Ticket` base. `aprobadoPorId` viene del JWT.
   * @throws 404 ticket o ticket_compra inexistente
   * @throws 422 motivo vacío, ya decidida, o transición inválida
   */
  @Post(':id/rechazar')
  @RequirePermissions('ticket:rechazar')
  @HttpCode(HttpStatus.OK)
  async rechazar(
    @Param('id') id: string,
    @Body() dto: RechazarCompraHttpDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TicketCompraConTicketResponseDto> {
    const result = await this.rechazarCompraUseCase.execute({
      ticketId: id,
      aprobadoPorId: user.sub,
      motivoRechazo: dto.motivoRechazo,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const { ticket, ticketCompra } = result.getValue();
    return toTicketCompraResponseDto(ticket, ticketCompra);
  }
}
