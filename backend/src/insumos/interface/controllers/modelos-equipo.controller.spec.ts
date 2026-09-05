import { describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ModelosEquipoController } from './modelos-equipo.controller';
import { AdminClienteGuard } from '../../../auth/infrastructure/guards/admin-cliente.guard';
import { ModeloEquipoEntity } from '../../domain/entities/modelo-equipo.entity';
import { InsumoEntity } from '../../domain/entities/insumo.entity';
import { Result } from '../../../shared/domain/result';
import {
  ModeloEquipoNoEncontradoError,
  ModeloEquipoDuplicadoError,
} from '../../domain/errors/modelos-equipo.errors';

describe('ModelosEquipoController', () => {
  function buildController(overrides: Record<string, { execute: ReturnType<typeof vi.fn> }> = {}) {
    const crearUseCase = overrides.crear ?? { execute: vi.fn() };
    const editarUseCase = overrides.editar ?? { execute: vi.fn() };
    const cambiarEstadoUseCase = overrides.cambiarEstado ?? { execute: vi.fn() };
    const listarUseCase = overrides.listar ?? { execute: vi.fn() };
    const listarInsumosUseCase = overrides.listarInsumos ?? { execute: vi.fn() };

    const controller = new ModelosEquipoController(
      crearUseCase as never,
      editarUseCase as never,
      cambiarEstadoUseCase as never,
      listarUseCase as never,
      listarInsumosUseCase as never,
    );
    return {
      controller,
      crearUseCase,
      editarUseCase,
      cambiarEstadoUseCase,
      listarUseCase,
      listarInsumosUseCase,
    };
  }

  function buildInsumo(codigo: string, modeloEquipoId: string): InsumoEntity {
    return InsumoEntity.create({
      codigo,
      nombre: `Insumo ${codigo}`,
      familiaId: 'fam-1',
      unidadMedidaId: 'uni-1',
      stockMinimo: null,
      activo: true,
      codigosAlternativos: [],
      compatibilidad: [{ modeloEquipoId, rol: 'NEGRO' }],
    });
  }

  it('GET /modelos-equipo retorna el listado mapeado a DTO', async () => {
    const modelo = ModeloEquipoEntity.create({ marca: 'HP', modelo: 'M404', activo: true });
    const { controller } = buildController({
      listar: { execute: vi.fn().mockResolvedValue([modelo]) },
    });

    const result = await controller.listar();

    expect(result).toHaveLength(1);
    expect(result[0]!.marca).toBe('HP');
  });

  /**
   * El assert es de CONTENIDO y no solo de forma: un handler que devolviera el
   * catálogo entero también sería un array de insumos, y la pregunta que este
   * endpoint responde —"¿qué insumo le va a ESTE modelo?"— quedaría sin
   * respuesta con la lista completa.
   */
  it('GET /modelos-equipo/:id/insumos retorna los insumos compatibles mapeados a DTO', async () => {
    const insumo = buildInsumo('TON-001', 'mod-1');
    const { controller } = buildController({
      listarInsumos: { execute: vi.fn().mockResolvedValue([insumo]) },
    });

    const result = await controller.listarInsumosCompatibles('mod-1');

    expect(result).toHaveLength(1);
    expect(result[0]!.codigo).toBe('TON-001');
    expect(result[0]!.compatibilidad).toEqual([{ modeloEquipoId: 'mod-1', rol: 'NEGRO' }]);
  });

  /** Si el id se perdiera, la consulta devolvería el subconjunto equivocado. */
  it('GET /modelos-equipo/:id/insumos delega el id del modelo al caso de uso', async () => {
    const { controller, listarInsumosUseCase } = buildController({
      listarInsumos: { execute: vi.fn().mockResolvedValue([]) },
    });

    await controller.listarInsumosCompatibles('mod-7');

    expect(listarInsumosUseCase.execute).toHaveBeenCalledWith('mod-7');
  });

  it('POST /modelos-equipo crea y retorna el DTO', async () => {
    const modelo = ModeloEquipoEntity.create({ marca: 'HP', modelo: 'M404', activo: true });
    const { controller } = buildController({
      crear: { execute: vi.fn().mockResolvedValue(Result.ok(modelo)) },
    });

    const result = await controller.crear({ marca: 'HP', modelo: 'M404' });

    expect(result.marca).toBe('HP');
  });

  it('POST /modelos-equipo con par duplicado lanza 422', async () => {
    const { controller } = buildController({
      crear: {
        execute: vi
          .fn()
          .mockResolvedValue(Result.fail(new ModeloEquipoDuplicadoError('HP', 'M404'))),
      },
    });

    await expect(controller.crear({ marca: 'HP', modelo: 'M404' })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('PATCH /modelos-equipo/:id con id inexistente lanza 404', async () => {
    const { controller } = buildController({
      editar: {
        execute: vi.fn().mockResolvedValue(Result.fail(new ModeloEquipoNoEncontradoError('id-x'))),
      },
    });

    await expect(controller.editar('id-x', { modelo: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('PATCH /modelos-equipo/:id/estado desactiva', async () => {
    const modelo = ModeloEquipoEntity.create({ marca: 'HP', modelo: 'M404', activo: true });
    modelo.desactivar();
    const { controller, cambiarEstadoUseCase } = buildController({
      cambiarEstado: { execute: vi.fn().mockResolvedValue(Result.ok(modelo)) },
    });

    const result = await controller.cambiarEstadoActivo('id-1', { activo: false });

    expect(result.activo).toBe(false);
    expect(cambiarEstadoUseCase.execute).toHaveBeenCalledWith({ id: 'id-1', activo: false });
  });

  /**
   * Sin este chequeo de metadata, borrar un `@UseGuards(AdminClienteGuard)` de
   * cualquier método de escritura deja toda la suite en verde: los tests de
   * arriba instancian el controller a mano y los guards nunca corren. Mismo
   * patrón que `familias-insumo.controller.spec.ts`.
   */
  describe('RBAC — metadata de guards, por método, NUNCA a nivel de clase', () => {
    it.each([
      ['crear', true],
      ['editar', true],
      ['cambiarEstadoActivo', true],
      ['listar', false],
      ['listarInsumosCompatibles', false],
    ] as const)('%s → AdminClienteGuard presente: %s', (metodo, debeEstarPresente) => {
      const handler = ModelosEquipoController.prototype[
        metodo as keyof typeof ModelosEquipoController.prototype
      ] as unknown as (...args: unknown[]) => unknown;
      const guards = (Reflect.getMetadata(GUARDS_METADATA, handler) ?? []) as unknown[];

      if (debeEstarPresente) {
        expect(guards).toContain(AdminClienteGuard);
      } else {
        expect(guards).not.toContain(AdminClienteGuard);
      }
    });
  });
});
