/**
 * 4.D.1 TEST — Unit tests para PresupuestosController.
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
import { PresupuestosController } from './presupuestos.controller';
import { Result } from '../../../shared/domain/result';
import { PresupuestoEntity } from '../../domain/entities/presupuesto.entity';
import {
  MonedaInvalidaError,
  PresupuestoNoEncontradoError,
  TicketCompraNoEncontradoError,
} from '../../domain/errors/compras.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { RolesGuard } from '../../../auth/infrastructure/guards/roles.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../../auth/infrastructure/guards/decorators';
import { CreatePresupuestoHttpDto } from '../dtos/compras.dto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePresupuesto(): PresupuestoEntity {
  const result = PresupuestoEntity.create({
    ticketCompraId: 'compra-001',
    proveedor: 'Proveedor SA',
    montoTotal: 500000,
    moneda: 'ARS',
    fechaCotizacion: new Date('2026-06-20'),
    seleccionado: false,
    observaciones: null,
  });
  return result.getValue();
}

function makeCreatePresupuestoDto(): CreatePresupuestoHttpDto {
  return {
    proveedor: 'Proveedor SA',
    montoTotal: 500000,
    moneda: 'ARS',
    fechaCotizacion: '2026-06-20',
  };
}

function makeUseCaseMocks() {
  return {
    agregarPresupuestoUseCase: { execute: vi.fn() },
    seleccionarPresupuestoUseCase: { execute: vi.fn() },
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('PresupuestosController', () => {
  let controller: PresupuestosController;
  let mocks: ReturnType<typeof makeUseCaseMocks>;

  beforeEach(() => {
    mocks = makeUseCaseMocks();
    controller = new PresupuestosController(
      mocks.agregarPresupuestoUseCase as any,
      mocks.seleccionarPresupuestoUseCase as any,
    );
  });

  // ─── POST /compras/:compraId/presupuestos ──────────────────────────────────

  describe('POST /compras/:compraId/presupuestos (agregarPresupuesto)', () => {
    it('retorna 201 con datos del presupuesto creado', async () => {
      const presupuesto = makePresupuesto();
      mocks.agregarPresupuestoUseCase.execute.mockResolvedValue(Result.ok(presupuesto));

      const result = await controller.agregarPresupuesto('compra-001', makeCreatePresupuestoDto());

      expect(result).toMatchObject({
        id: presupuesto.id,
        ticketCompraId: 'compra-001',
        proveedor: 'Proveedor SA',
        montoTotal: 500000,
        moneda: 'ARS',
        seleccionado: false,
      });
      expect(mocks.agregarPresupuestoUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketCompraId: 'compra-001',
          proveedor: 'Proveedor SA',
          moneda: 'ARS',
        }),
      );
    });

    it('lanza NotFoundException cuando el ticket_compra no existe', async () => {
      mocks.agregarPresupuestoUseCase.execute.mockResolvedValue(
        Result.fail(new TicketCompraNoEncontradoError('compra-x')),
      );

      await expect(
        controller.agregarPresupuesto('compra-x', makeCreatePresupuestoDto()),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza UnprocessableEntityException cuando la moneda es inválida', async () => {
      mocks.agregarPresupuestoUseCase.execute.mockResolvedValue(
        Result.fail(new MonedaInvalidaError('BRL')),
      );

      await expect(
        controller.agregarPresupuesto('compra-001', {
          ...makeCreatePresupuestoDto(),
          moneda: 'BRL',
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  // ─── POST /compras/:compraId/presupuestos/:presupuestoId/seleccionar ────────

  describe('POST /compras/:compraId/presupuestos/:presupuestoId/seleccionar (seleccionarPresupuesto)', () => {
    it('retorna 200 con el presupuesto seleccionado', async () => {
      const presupuesto = makePresupuesto();
      presupuesto.seleccionar();
      mocks.seleccionarPresupuestoUseCase.execute.mockResolvedValue(Result.ok(presupuesto));

      const result = await controller.seleccionarPresupuesto('compra-001', presupuesto.id);

      expect(result).toMatchObject({
        id: presupuesto.id,
        seleccionado: true,
      });
      expect(mocks.seleccionarPresupuestoUseCase.execute).toHaveBeenCalledWith({
        presupuestoId: presupuesto.id,
      });
    });

    it('lanza NotFoundException cuando el presupuesto no existe', async () => {
      mocks.seleccionarPresupuestoUseCase.execute.mockResolvedValue(
        Result.fail(new PresupuestoNoEncontradoError('presupuesto-x')),
      );

      await expect(
        controller.seleccionarPresupuesto('compra-001', 'presupuesto-x'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Guard chain (via Reflect metadata) ────────────────────────────────────

  describe('Guard chain', () => {
    it('aplica JwtAuthGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', PresupuestosController) ?? [];
      expect(guards).toContain(JwtAuthGuard);
    });

    it('aplica RolesGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', PresupuestosController) ?? [];
      expect(guards).toContain(RolesGuard);
    });

    it('aplica PermissionsGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', PresupuestosController) ?? [];
      expect(guards).toContain(PermissionsGuard);
    });

    it('aplica TenantGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', PresupuestosController) ?? [];
      expect(guards).toContain(TenantGuard);
    });

    it('requiere permiso compra:gestionar en agregarPresupuesto', () => {
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, PresupuestosController.prototype.agregarPresupuesto) ??
        [];
      expect(perms).toContain('compra:gestionar');
    });

    it('requiere permiso compra:gestionar en seleccionarPresupuesto', () => {
      const perms: string[] =
        Reflect.getMetadata(
          PERMISSIONS_KEY,
          PresupuestosController.prototype.seleccionarPresupuesto,
        ) ?? [];
      expect(perms).toContain('compra:gestionar');
    });
  });
});
