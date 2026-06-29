/**
 * 4.D.1 TEST — Unit tests para ItemsCompraController.
 *
 * Verifica que el controlador:
 * - Delega a los use cases con los DTOs correctos.
 * - Retorna la respuesta esperada (status codes + shape).
 * - Mapea errores de dominio a HttpException apropiadas.
 * - Aplica guard chain y @RequirePermissions('compra:gestionar').
 *
 * Los use cases son mockeados.
 *
 * Tarea: 4.D.1
 */

import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ItemsCompraController } from './items-compra.controller';
import { Result } from '../../../shared/domain/result';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import {
  CantidadInvalidaError,
  TicketCompraNoEncontradoError,
  ItemCompraNoEncontradoError,
} from '../../domain/errors/compras.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { RolesGuard } from '../../../auth/infrastructure/guards/roles.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../../auth/infrastructure/guards/decorators';
import { CreateItemCompraHttpDto } from '../dtos/compras.dto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeItem(): ItemCompraEntity {
  const result = ItemCompraEntity.create({
    ticketCompraId: 'compra-001',
    descripcion: 'Impresora láser',
    cantidad: 2,
    unidad: 'unidad',
    precioUnitarioRef: 150000,
    observaciones: null,
  });
  return result.getValue();
}

function makeCreateItemDto(): CreateItemCompraHttpDto {
  return {
    descripcion: 'Impresora láser',
    cantidad: 2,
    unidad: 'unidad',
    precioUnitarioRef: 150000,
  };
}

function makeUseCaseMocks() {
  return {
    agregarItemCompraUseCase: { execute: vi.fn() },
    eliminarItemCompraUseCase: { execute: vi.fn() },
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ItemsCompraController', () => {
  let controller: ItemsCompraController;
  let mocks: ReturnType<typeof makeUseCaseMocks>;

  beforeEach(() => {
    mocks = makeUseCaseMocks();
    controller = new ItemsCompraController(
      mocks.agregarItemCompraUseCase as any,
      mocks.eliminarItemCompraUseCase as any,
    );
  });

  // ─── POST /compras/:compraId/items ─────────────────────────────────────────

  describe('POST /compras/:compraId/items (agregarItem)', () => {
    it('retorna 201 con datos del ítem creado', async () => {
      const item = makeItem();
      mocks.agregarItemCompraUseCase.execute.mockResolvedValue(Result.ok(item));

      const result = await controller.agregarItem('compra-001', makeCreateItemDto());

      expect(result).toMatchObject({
        id: item.id,
        ticketCompraId: 'compra-001',
        descripcion: 'Impresora láser',
        cantidad: 2,
      });
      expect(mocks.agregarItemCompraUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketCompraId: 'compra-001',
          descripcion: 'Impresora láser',
          cantidad: 2,
        }),
      );
    });

    it('lanza NotFoundException cuando el ticket_compra no existe', async () => {
      mocks.agregarItemCompraUseCase.execute.mockResolvedValue(
        Result.fail(new TicketCompraNoEncontradoError('compra-x')),
      );

      await expect(controller.agregarItem('compra-x', makeCreateItemDto())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza UnprocessableEntityException cuando la cantidad es 0 o negativa', async () => {
      mocks.agregarItemCompraUseCase.execute.mockResolvedValue(
        Result.fail(new CantidadInvalidaError(0)),
      );

      await expect(
        controller.agregarItem('compra-001', { ...makeCreateItemDto(), cantidad: 0 }),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  // ─── DELETE /compras/:compraId/items/:itemId ───────────────────────────────

  describe('DELETE /compras/:compraId/items/:itemId (eliminarItem)', () => {
    it('retorna 204 (void) cuando el ítem se elimina correctamente', async () => {
      mocks.eliminarItemCompraUseCase.execute.mockResolvedValue(Result.ok(undefined));

      const result = await controller.eliminarItem('compra-001', 'item-001');

      expect(result).toBeUndefined();
      expect(mocks.eliminarItemCompraUseCase.execute).toHaveBeenCalledWith({ itemId: 'item-001' });
    });

    it('lanza NotFoundException cuando el ítem no existe', async () => {
      mocks.eliminarItemCompraUseCase.execute.mockResolvedValue(
        Result.fail(new ItemCompraNoEncontradoError('item-x')),
      );

      await expect(controller.eliminarItem('compra-001', 'item-x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── Guard chain (via Reflect metadata) ────────────────────────────────────

  describe('Guard chain', () => {
    it('aplica JwtAuthGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', ItemsCompraController) ?? [];
      expect(guards).toContain(JwtAuthGuard);
    });

    it('aplica RolesGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', ItemsCompraController) ?? [];
      expect(guards).toContain(RolesGuard);
    });

    it('aplica PermissionsGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', ItemsCompraController) ?? [];
      expect(guards).toContain(PermissionsGuard);
    });

    it('aplica TenantGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', ItemsCompraController) ?? [];
      expect(guards).toContain(TenantGuard);
    });

    it('requiere permiso compra:gestionar en agregarItem', () => {
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, ItemsCompraController.prototype.agregarItem) ?? [];
      expect(perms).toContain('compra:gestionar');
    });

    it('requiere permiso compra:gestionar en eliminarItem', () => {
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, ItemsCompraController.prototype.eliminarItem) ?? [];
      expect(perms).toContain('compra:gestionar');
    });
  });
});
