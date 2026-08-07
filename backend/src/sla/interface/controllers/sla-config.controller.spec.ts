/**
 * SA8 [CONTROLLER][RED→GREEN] — `SlaConfigController` (S1).
 *
 * Unit test: instancia el controller directamente con use cases mockeados,
 * mismo patrón que `ubicaciones.controller.spec.ts`/`catalogos.controller` —
 * verifica gateo por `catalogo:gestionar` (reusado, decisión del dueño: sin
 * permiso nuevo `sla:gestionar`) vía metadata `@RequirePermissions`.
 *
 * Ref spec: sdd/premium/spec S1. Tarea: SA8/SA9.
 */
import 'reflect-metadata';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { SlaConfigController } from './sla-config.controller';
import { PERMISSIONS_KEY } from '../../../auth/infrastructure/guards/decorators';
import { Result } from '../../../shared/domain/result';
import { SlaConfigEntity } from '../../domain/entities/sla-config.entity';
import { SlaConfigNoEncontradaError, HorasInvalidasError } from '../../domain/errors/sla.errors';

describe('SlaConfigController (SA8)', () => {
  function buildController() {
    const listarSlaConfigUseCase = { execute: vi.fn() };
    const editarSlaConfigUseCase = { execute: vi.fn() };

    const controller = new SlaConfigController(
      listarSlaConfigUseCase as never,
      editarSlaConfigUseCase as never,
    );

    return { controller, listarSlaConfigUseCase, editarSlaConfigUseCase };
  }

  it('[CRITICAL] declara @RequirePermissions("catalogo:gestionar") a nivel de controller', () => {
    const permisos = Reflect.getMetadata(PERMISSIONS_KEY, SlaConfigController);
    expect(permisos).toEqual(['catalogo:gestionar']);
  });

  describe('GET /sla/config', () => {
    it('lista las 4 configs del tenant', async () => {
      const { controller, listarSlaConfigUseCase } = buildController();
      const config = SlaConfigEntity.create(
        { prioridadId: 'p-1', horas: 4, activo: true },
        'config-uuid',
      );
      listarSlaConfigUseCase.execute.mockResolvedValue([config]);

      const result = await controller.listar();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('config-uuid');
      expect(result[0].horas).toBe(4);
    });
  });

  describe('PATCH /sla/config/:id', () => {
    it('edita horas/activo y retorna la config actualizada', async () => {
      const { controller, editarSlaConfigUseCase } = buildController();
      const config = SlaConfigEntity.create(
        { prioridadId: 'p-1', horas: 6, activo: false },
        'config-uuid',
      );
      editarSlaConfigUseCase.execute.mockResolvedValue(Result.ok(config));

      const result = await controller.editar('config-uuid', { horas: 6, activo: false });

      expect(result.horas).toBe(6);
      expect(result.activo).toBe(false);
      expect(editarSlaConfigUseCase.execute).toHaveBeenCalledWith({
        id: 'config-uuid',
        horas: 6,
        activo: false,
      });
    });

    it('mapea SlaConfigNoEncontradaError → 404', async () => {
      const { controller, editarSlaConfigUseCase } = buildController();
      editarSlaConfigUseCase.execute.mockResolvedValue(
        Result.fail(new SlaConfigNoEncontradaError('inexistente')),
      );

      await expect(controller.editar('inexistente', { horas: 6 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('mapea HorasInvalidasError → 422', async () => {
      const { controller, editarSlaConfigUseCase } = buildController();
      editarSlaConfigUseCase.execute.mockResolvedValue(Result.fail(new HorasInvalidasError(0)));

      await expect(controller.editar('config-uuid', { horas: 0 })).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });
});
