/**
 * ItemsCompraController — gestión de ítems de compra.
 *
 * Rutas (nested bajo /compras/:compraId):
 *   POST   /compras/:compraId/items            → AgregarItemCompraUseCase  [compra:gestionar]
 *   DELETE /compras/:compraId/items/:itemId    → EliminarItemCompraUseCase [compra:gestionar]
 *
 * Guard chain (clase): JwtAuthGuard → RolesGuard → PermissionsGuard → TenantGuard
 *
 * Tarea: 4.D.2
 */
import {
  Body,
  Controller,
  Delete,
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

import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import {
  CantidadInvalidaError,
  ItemCompraNoEncontradoError,
  TicketCompraNoEncontradoError,
} from '../../domain/errors/compras.errors';

import { AgregarItemCompraUseCase } from '../../application/use-cases/agregar-item-compra.use-case';
import { EliminarItemCompraUseCase } from '../../application/use-cases/eliminar-item-compra.use-case';

import { CreateItemCompraHttpDto, ItemCompraResponseDto } from '../dtos/compras.dto';

// ─── Mapper ───────────────────────────────────────────────────────────────────

function toItemCompraResponse(item: ItemCompraEntity): ItemCompraResponseDto {
  return {
    id: item.id,
    ticketCompraId: item.ticketCompraId,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    unidad: item.unidad,
    precioUnitarioRef: item.precioUnitarioRef,
    observaciones: item.observaciones,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('compras')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class ItemsCompraController {
  constructor(
    private readonly agregarItemCompraUseCase: AgregarItemCompraUseCase,
    private readonly eliminarItemCompraUseCase: EliminarItemCompraUseCase,
  ) {}

  /**
   * POST /compras/:compraId/items
   * Agrega un ítem a un ticket de compra existente.
   *
   * @returns 201 Created + ItemCompraResponseDto
   * @throws 404 si el ticket_compra no existe
   * @throws 422 si la cantidad es inválida (≤ 0)
   */
  @Post(':compraId/items')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('compra:gestionar')
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
      const error = result.getError();
      if (error instanceof TicketCompraNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof CantidadInvalidaError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw new UnprocessableEntityException('No se pudo agregar el ítem de compra');
    }

    return toItemCompraResponse(result.getValue());
  }

  /**
   * DELETE /compras/:compraId/items/:itemId
   * Baja lógica (soft delete) de un ítem de compra.
   *
   * @returns 204 No Content
   * @throws 404 si el ítem no existe
   */
  @Delete(':compraId/items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('compra:gestionar')
  async eliminarItem(
    @Param('compraId') _compraId: string,
    @Param('itemId') itemId: string,
  ): Promise<void> {
    const result = await this.eliminarItemCompraUseCase.execute({ itemId });

    if (result.isFail()) {
      const error = result.getError();
      if (error instanceof ItemCompraNoEncontradoError) {
        throw new NotFoundException(error.message);
      }
      throw new NotFoundException('Ítem de compra no encontrado');
    }
  }
}
