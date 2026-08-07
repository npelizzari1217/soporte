/**
 * T8.6 [CONTROLLER][RED→GREEN] — `UbicacionesController`.
 *
 * Unit test: instancia el controller directamente con use cases mockeados,
 * mismo patrón que `reparaciones.controller.spec.ts`/`compras.controller.spec.ts`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E2. Tarea: T8.6.
 */
import 'reflect-metadata';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { UbicacionesController } from './ubicaciones.controller';
import { PERMISSIONS_KEY } from '../../../auth/infrastructure/guards/decorators';
import { Result } from '../../../shared/domain/result';
import { UbicacionEntity } from '../../domain/entities/ubicacion.entity';
import {
  UbicacionInvalidaError,
  UbicacionNoEncontradaError,
} from '../../domain/errors/reparaciones.errors';

describe('UbicacionesController (T8.6)', () => {
  function buildController() {
    const crearUbicacionUseCase = { execute: vi.fn() };
    const listarUbicacionesUseCase = { execute: vi.fn() };
    const editarUbicacionUseCase = { execute: vi.fn() };
    const eliminarUbicacionUseCase = { execute: vi.fn() };

    const controller = new UbicacionesController(
      crearUbicacionUseCase as any,
      listarUbicacionesUseCase as any,
      editarUbicacionUseCase as any,
      eliminarUbicacionUseCase as any,
    );

    return {
      controller,
      crearUbicacionUseCase,
      listarUbicacionesUseCase,
      editarUbicacionUseCase,
      eliminarUbicacionUseCase,
    };
  }

  describe('POST /ubicaciones', () => {
    it('crea la ubicación', async () => {
      const { controller, crearUbicacionUseCase } = buildController();
      const ubicacion = UbicacionEntity.create({ nombre: 'Edificio Central' }, 'ubicacion-uuid');
      crearUbicacionUseCase.execute.mockResolvedValue(Result.ok(ubicacion));

      const result = await controller.crear({ nombre: 'Edificio Central' } as any);

      expect(result.id).toBe('ubicacion-uuid');
      expect(result.nombre).toBe('Edificio Central');
    });

    it('mapea UbicacionInvalidaError → 422', async () => {
      const { controller, crearUbicacionUseCase } = buildController();
      crearUbicacionUseCase.execute.mockResolvedValue(
        Result.fail(new UbicacionInvalidaError('padre-uuid')),
      );

      await expect(
        controller.crear({ nombre: 'X', padreId: 'padre-uuid' } as any),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('declara @RequirePermissions("catalogo:gestionar")', () => {
      const permisos = Reflect.getMetadata(PERMISSIONS_KEY, UbicacionesController.prototype.crear);
      expect(permisos).toEqual(['catalogo:gestionar']);
    });
  });

  describe('GET /ubicaciones', () => {
    it('lista las ubicaciones del tenant', async () => {
      const { controller, listarUbicacionesUseCase } = buildController();
      const ubicacion = UbicacionEntity.create({ nombre: 'Edificio Central' }, 'ubicacion-uuid');
      listarUbicacionesUseCase.execute.mockResolvedValue(Result.ok([ubicacion]));

      const result = await controller.listar();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('ubicacion-uuid');
    });

    it('NO declara @RequirePermissions (cualquier usuario autenticado puede listar)', () => {
      const permisos = Reflect.getMetadata(PERMISSIONS_KEY, UbicacionesController.prototype.listar);
      expect(permisos).toBeUndefined();
    });
  });

  describe('PATCH /ubicaciones/:id', () => {
    it('edita la ubicación', async () => {
      const { controller, editarUbicacionUseCase } = buildController();
      const ubicacion = UbicacionEntity.create({ nombre: 'Nuevo nombre' }, 'ubicacion-uuid');
      editarUbicacionUseCase.execute.mockResolvedValue(Result.ok(ubicacion));

      const result = await controller.editar('ubicacion-uuid', { nombre: 'Nuevo nombre' } as any);

      expect(result.nombre).toBe('Nuevo nombre');
      expect(editarUbicacionUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ ubicacionId: 'ubicacion-uuid', nombre: 'Nuevo nombre' }),
      );
    });

    it('mapea UbicacionNoEncontradaError → 404', async () => {
      const { controller, editarUbicacionUseCase } = buildController();
      editarUbicacionUseCase.execute.mockResolvedValue(
        Result.fail(new UbicacionNoEncontradaError('inexistente')),
      );

      await expect(controller.editar('inexistente', { nombre: 'X' } as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('declara @RequirePermissions("catalogo:gestionar")', () => {
      const permisos = Reflect.getMetadata(PERMISSIONS_KEY, UbicacionesController.prototype.editar);
      expect(permisos).toEqual(['catalogo:gestionar']);
    });
  });

  describe('DELETE /ubicaciones/:id', () => {
    it('elimina en cascada la ubicación', async () => {
      const { controller, eliminarUbicacionUseCase } = buildController();
      eliminarUbicacionUseCase.execute.mockResolvedValue(Result.ok(undefined));

      await controller.eliminar('ubicacion-uuid');

      expect(eliminarUbicacionUseCase.execute).toHaveBeenCalledWith({
        ubicacionId: 'ubicacion-uuid',
      });
    });

    it('mapea UbicacionNoEncontradaError → 404', async () => {
      const { controller, eliminarUbicacionUseCase } = buildController();
      eliminarUbicacionUseCase.execute.mockResolvedValue(
        Result.fail(new UbicacionNoEncontradaError('inexistente')),
      );

      await expect(controller.eliminar('inexistente')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('declara @RequirePermissions("catalogo:gestionar")', () => {
      const permisos = Reflect.getMetadata(
        PERMISSIONS_KEY,
        UbicacionesController.prototype.eliminar,
      );
      expect(permisos).toEqual(['catalogo:gestionar']);
    });
  });
});
