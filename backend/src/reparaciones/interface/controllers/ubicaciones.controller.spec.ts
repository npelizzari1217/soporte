/**
 * 5.D.1 TEST — Unit tests para UbicacionesController.
 *
 * Verifica que el controlador:
 * - Delega a CrearUbicacionUseCase con los DTOs correctos.
 * - Delega a EliminarUbicacionUseCase con el id y autorId del JWT.
 * - Retorna la respuesta esperada (status codes + shape).
 * - Mapea errores de dominio a HttpException apropiadas.
 * - Aplica la cadena de guards JWT → Roles/Permissions → Tenant.
 *
 * Los use cases son mockeados (sin Prisma ni NestJS DI).
 *
 * Tarea: 5.D.1
 */
import { NotFoundException } from '@nestjs/common';
import { UbicacionesController } from './ubicaciones.controller';
import { Result } from '../../../shared/domain/result';
import { UbicacionEntity } from '../../domain/entities/ubicacion.entity';
import {
  PadreUbicacionEliminadoError,
  UbicacionInvalidaError,
} from '../../domain/errors/reparaciones.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { RolesGuard } from '../../../auth/infrastructure/guards/roles.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'user-001',
    cliente_id: 'cli-abc',
    email: 'tecnico@example.com',
    roles: ['MANTENIMIENTO'],
    permisos: ['ticket:crear', 'subtarea:actualizar'],
    ...overrides,
  };
}

function makeUbicacion(): UbicacionEntity {
  return UbicacionEntity.create({
    nombre: 'Edificio Central',
    descripcion: 'Sede principal',
    padreId: null,
  });
}

function makeUseCaseMocks() {
  return {
    crearUbicacionUseCase: { execute: jest.fn() },
    eliminarUbicacionUseCase: { execute: jest.fn() },
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('UbicacionesController', () => {
  let controller: UbicacionesController;
  let mocks: ReturnType<typeof makeUseCaseMocks>;
  let user: JwtPayload;

  beforeEach(() => {
    mocks = makeUseCaseMocks();
    user = makeUser();
    controller = new UbicacionesController(
      mocks.crearUbicacionUseCase as any,
      mocks.eliminarUbicacionUseCase as any,
    );
  });

  // ─── POST /ubicaciones ──────────────────────────────────────────────────────

  describe('POST /ubicaciones (crearUbicacion)', () => {
    it('retorna 201 con datos de la ubicacion creada', async () => {
      const ubicacion = makeUbicacion();
      mocks.crearUbicacionUseCase.execute.mockResolvedValue(Result.ok(ubicacion));

      const result = await controller.crearUbicacion(
        { nombre: 'Edificio Central', descripcion: 'Sede principal' },
        user,
      );

      expect(result).toMatchObject({
        nombre: 'Edificio Central',
        descripcion: 'Sede principal',
        padreId: null,
        activo: true,
      });
    });

    it('delega al use case con los datos del dto', async () => {
      const ubicacion = makeUbicacion();
      mocks.crearUbicacionUseCase.execute.mockResolvedValue(Result.ok(ubicacion));
      const dto = { nombre: 'Sala A', descripcion: null, padreId: 'padre-001' };

      await controller.crearUbicacion(dto, user);

      expect(mocks.crearUbicacionUseCase.execute).toHaveBeenCalledWith({
        nombre: 'Sala A',
        descripcion: null,
        padreId: 'padre-001',
      });
    });

    it('lanza NotFoundException cuando el padre no existe o está eliminado', async () => {
      mocks.crearUbicacionUseCase.execute.mockResolvedValue(
        Result.fail(new PadreUbicacionEliminadoError('padre-x')),
      );

      await expect(controller.crearUbicacion({ nombre: 'Sub-sala' }, user)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── DELETE /ubicaciones/:id ────────────────────────────────────────────────

  describe('DELETE /ubicaciones/:id (eliminarUbicacion)', () => {
    it('retorna 204 (void) cuando la eliminación es exitosa', async () => {
      mocks.eliminarUbicacionUseCase.execute.mockResolvedValue(Result.ok(undefined));

      const result = await controller.eliminarUbicacion('ub-001', user);

      expect(result).toBeUndefined();
      expect(mocks.eliminarUbicacionUseCase.execute).toHaveBeenCalledWith({
        ubicacionId: 'ub-001',
        autorId: 'user-001',
      });
    });

    it('lanza NotFoundException cuando la ubicacion no existe o está eliminada', async () => {
      mocks.eliminarUbicacionUseCase.execute.mockResolvedValue(
        Result.fail(new UbicacionInvalidaError('ub-x')),
      );

      await expect(controller.eliminarUbicacion('ub-x', user)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Guard chain (via Reflect metadata) ────────────────────────────────────

  describe('Guard chain', () => {
    it('aplica JwtAuthGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', UbicacionesController) ?? [];
      expect(guards).toContain(JwtAuthGuard);
    });

    it('aplica TenantGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', UbicacionesController) ?? [];
      expect(guards).toContain(TenantGuard);
    });

    it('aplica RolesGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', UbicacionesController) ?? [];
      expect(guards).toContain(RolesGuard);
    });

    it('aplica PermissionsGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', UbicacionesController) ?? [];
      expect(guards).toContain(PermissionsGuard);
    });

    it('requiere permiso ticket:crear en crearUbicacion', () => {
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, UbicacionesController.prototype.crearUbicacion) ?? [];
      expect(perms).toContain('ticket:crear');
    });

    it('requiere permiso ticket:crear en eliminarUbicacion', () => {
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, UbicacionesController.prototype.eliminarUbicacion) ??
        [];
      expect(perms).toContain('ticket:crear');
    });
  });
});
