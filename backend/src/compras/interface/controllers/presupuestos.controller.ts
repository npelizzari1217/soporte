/**
 * PresupuestosController — gestión de presupuestos de proveedor.
 *
 * Rutas (nested bajo /compras/:compraId):
 *   POST /compras/:compraId/presupuestos                             → AgregarPresupuestoUseCase      [compra:gestionar]
 *   POST /compras/:compraId/presupuestos/:presupuestoId/seleccionar  → SeleccionarPresupuestoUseCase  [compra:gestionar]
 *
 * Guard chain (clase): JwtAuthGuard → RolesGuard → PermissionsGuard → TenantGuard
 *
 * Tarea: 4.D.2
 */
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/infrastructure/guards/roles.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { RequirePermissions } from '../../../auth/infrastructure/guards/decorators';

import { PresupuestoEntity } from '../../domain/entities/presupuesto.entity';
import {
  MonedaInvalidaError,
  PresupuestoNoEncontradoError,
  TicketCompraNoEncontradoError,
} from '../../domain/errors/compras.errors';

import { AgregarPresupuestoUseCase } from '../../application/use-cases/agregar-presupuesto.use-case';
import { SeleccionarPresupuestoUseCase } from '../../application/use-cases/seleccionar-presupuesto.use-case';

import { CreatePresupuestoHttpDto, PresupuestoResponseDto } from '../dtos/compras.dto';

// ─── Mapper ───────────────────────────────────────────────────────────────────

function toPresupuestoResponse(presupuesto: PresupuestoEntity): PresupuestoResponseDto {
  return {
    id: presupuesto.id,
    ticketCompraId: presupuesto.ticketCompraId,
    proveedor: presupuesto.proveedor,
    montoTotal: presupuesto.montoTotal,
    moneda: presupuesto.moneda,
    fechaCotizacion: presupuesto.fechaCotizacion.toISOString().split('T')[0],
    seleccionado: presupuesto.seleccionado,
    observaciones: presupuesto.observaciones,
    createdAt: presupuesto.createdAt.toISOString(),
    updatedAt: presupuesto.updatedAt.toISOString(),
  };
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('compras')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class PresupuestosController {
  constructor(
    private readonly agregarPresupuestoUseCase: AgregarPresupuestoUseCase,
    private readonly seleccionarPresupuestoUseCase: SeleccionarPresupuestoUseCase,
  ) {}

  /**
   * POST /compras/:compraId/presupuestos
   * Agrega una cotización de proveedor a un ticket de compra.
   *
   * @returns 201 Created + PresupuestoResponseDto
   * @throws 404 si el ticket_compra no existe
   * @throws 422 si la moneda es inválida (no es ARS, USD ni EUR)
   */
  @Post(':compraId/presupuestos')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('compra:gestionar')
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
      const error = result.getError();
      if (error instanceof TicketCompraNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof MonedaInvalidaError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw new UnprocessableEntityException('No se pudo agregar el presupuesto');
    }

    return toPresupuestoResponse(result.getValue());
  }

  /**
   * POST /compras/:compraId/presupuestos/:presupuestoId/seleccionar
   * Marca un presupuesto como el ganador. Swap atómico con el anterior.
   *
   * @returns 200 OK + PresupuestoResponseDto con seleccionado = true
   * @throws 404 si el presupuesto no existe
   */
  @Post(':compraId/presupuestos/:presupuestoId/seleccionar')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('compra:gestionar')
  async seleccionarPresupuesto(
    @Param('compraId') _compraId: string,
    @Param('presupuestoId') presupuestoId: string,
  ): Promise<PresupuestoResponseDto> {
    const result = await this.seleccionarPresupuestoUseCase.execute({
      presupuestoId,
    });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof PresupuestoNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      throw new NotFoundException('Presupuesto no encontrado');
    }

    return toPresupuestoResponse(result.getValue());
  }
}
