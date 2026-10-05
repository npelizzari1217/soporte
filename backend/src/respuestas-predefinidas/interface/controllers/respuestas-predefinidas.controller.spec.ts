import { describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { RespuestasPredefinidasController } from './respuestas-predefinidas.controller';
import { AdminClienteGuard } from '../../../auth/infrastructure/guards/admin-cliente.guard';
import { RespuestaPredefinidaEntity } from '../../domain/entities/respuesta-predefinida.entity';
import { IRespuestaPredefinidaRepository } from '../../domain/ports/i-respuesta-predefinida.repository';
import { CrearRespuestaPredefinidaUseCase } from '../../application/use-cases/crear-respuesta-predefinida.use-case';
import { EditarRespuestaPredefinidaUseCase } from '../../application/use-cases/editar-respuesta-predefinida.use-case';
import { CambiarEstadoActivoRespuestaPredefinidaUseCase } from '../../application/use-cases/cambiar-estado-activo-respuesta-predefinida.use-case';
import { ListarRespuestasPredefinidasUseCase } from '../../application/use-cases/listar-respuestas-predefinidas.use-case';

describe('RespuestasPredefinidasController', () => {
  const nueva = (activo = true) =>
    RespuestaPredefinidaEntity.create({ titulo: 'Saludo', texto: 'Hola', activo }, 'id-1');

  /** Casos de uso REALES sobre un repo completo contra su puerto: sin casts. */
  function buildController(overrides: Partial<IRespuestaPredefinidaRepository> = {}) {
    const repo: IRespuestaPredefinidaRepository = {
      findById: vi.fn().mockResolvedValue(null),
      findByTitulo: vi.fn().mockResolvedValue(null),
      findAll: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
    const controller = new RespuestasPredefinidasController(
      new CrearRespuestaPredefinidaUseCase(repo),
      new EditarRespuestaPredefinidaUseCase(repo),
      new CambiarEstadoActivoRespuestaPredefinidaUseCase(repo),
      new ListarRespuestasPredefinidasUseCase(repo),
    );
    return { controller, repo };
  }

  it.each([
    [{ activas: true }, true],
    [{ activas: false }, false],
    [{}, false],
  ])('GET con query %j pide soloActivas=%s', async (query, soloActivas) => {
    const { controller, repo } = buildController({
      findAll: vi.fn().mockResolvedValue([nueva()]),
    });

    const result = await controller.listar(query);

    expect(repo.findAll).toHaveBeenCalledWith(soloActivas);
    expect(result[0]!.titulo).toBe('Saludo');
  });

  it('POST crea y retorna el DTO', async () => {
    const { controller, repo } = buildController();

    const result = await controller.crear({ titulo: 'Saludo', texto: 'Hola' });

    expect(result).toMatchObject({ titulo: 'Saludo', texto: 'Hola', activo: true });
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('POST con título duplicado lanza 422', async () => {
    const { controller } = buildController({ findByTitulo: vi.fn().mockResolvedValue(nueva()) });

    await expect(controller.crear({ titulo: 'saludo', texto: 'Hola' })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('PATCH con id inexistente lanza 404', async () => {
    const { controller } = buildController();

    await expect(controller.editar('x', { texto: 'y' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('PATCH /:id/estado desactiva', async () => {
    const { controller } = buildController({ findById: vi.fn().mockResolvedValue(nueva()) });

    const result = await controller.cambiarEstadoActivo('id-1', { activo: false });

    expect(result.activo).toBe(false);
  });

  // Sin este chequeo de metadata, borrar `@UseGuards(AdminClienteGuard)` de una escritura deja
  // todo en verde. Se lee GUARDS_METADATA real, no un mock.
  describe('RBAC — metadata de guards, por método y NUNCA a nivel de clase', () => {
    it.each([
      ['crear', true],
      ['editar', true],
      ['cambiarEstadoActivo', true],
      ['listar', false],
    ] as const)('%s → AdminClienteGuard presente: %s', (metodo, debeEstar) => {
      const handler = RespuestasPredefinidasController.prototype[metodo] as unknown as (
        ...args: unknown[]
      ) => unknown;
      const guards = (Reflect.getMetadata(GUARDS_METADATA, handler) ?? []) as unknown[];

      if (debeEstar) {
        expect(guards).toContain(AdminClienteGuard);
      } else {
        expect(guards).not.toContain(AdminClienteGuard);
      }
    });

    it('la clase NO lleva AdminClienteGuard (rompería la lectura abierta)', () => {
      const guards = (Reflect.getMetadata(GUARDS_METADATA, RespuestasPredefinidasController) ??
        []) as unknown[];
      expect(guards).not.toContain(AdminClienteGuard);
    });
  });
});
