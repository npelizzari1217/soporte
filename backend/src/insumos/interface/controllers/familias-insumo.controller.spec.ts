import { describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { FamiliasInsumoController } from './familias-insumo.controller';
import { AdminClienteGuard } from '../../../auth/infrastructure/guards/admin-cliente.guard';
import { FamiliaInsumoEntity } from '../../domain/entities/familia-insumo.entity';
import { Result } from '../../../shared/domain/result';
import {
  FamiliaInsumoNoEncontradaError,
  FamiliaInsumoCodigoDuplicadoError,
} from '../../domain/errors/familias-insumo.errors';

describe('FamiliasInsumoController', () => {
  function buildController(overrides: Record<string, { execute: ReturnType<typeof vi.fn> }> = {}) {
    const crearUseCase = overrides.crear ?? { execute: vi.fn() };
    const editarUseCase = overrides.editar ?? { execute: vi.fn() };
    const cambiarEstadoUseCase = overrides.cambiarEstado ?? { execute: vi.fn() };
    const listarUseCase = overrides.listar ?? { execute: vi.fn() };

    const controller = new FamiliasInsumoController(
      crearUseCase as never,
      editarUseCase as never,
      cambiarEstadoUseCase as never,
      listarUseCase as never,
    );
    return { controller, crearUseCase, editarUseCase, cambiarEstadoUseCase, listarUseCase };
  }

  it('GET /familias-insumo retorna el listado mapeado a DTO', async () => {
    const familia = FamiliaInsumoEntity.create({ codigo: 'A', nombre: 'A', activo: true });
    const { controller } = buildController({
      listar: { execute: vi.fn().mockResolvedValue([familia]) },
    });

    const result = await controller.listar();

    expect(result).toHaveLength(1);
    expect(result[0]!.codigo).toBe('A');
  });

  it('POST /familias-insumo crea y retorna el DTO', async () => {
    const familia = FamiliaInsumoEntity.create({ codigo: 'A', nombre: 'A', activo: true });
    const { controller } = buildController({
      crear: { execute: vi.fn().mockResolvedValue(Result.ok(familia)) },
    });

    const result = await controller.crear({ codigo: 'A', nombre: 'A' });

    expect(result.codigo).toBe('A');
  });

  it('POST /familias-insumo con codigo duplicado lanza 422', async () => {
    const { controller } = buildController({
      crear: {
        execute: vi.fn().mockResolvedValue(Result.fail(new FamiliaInsumoCodigoDuplicadoError('A'))),
      },
    });

    await expect(controller.crear({ codigo: 'A', nombre: 'A' })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('PATCH /familias-insumo/:id con id inexistente lanza 404', async () => {
    const { controller } = buildController({
      editar: {
        execute: vi.fn().mockResolvedValue(Result.fail(new FamiliaInsumoNoEncontradaError('id-x'))),
      },
    });

    await expect(controller.editar('id-x', { nombre: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('PATCH /familias-insumo/:id/estado desactiva', async () => {
    const familia = FamiliaInsumoEntity.create({ codigo: 'A', nombre: 'A', activo: true });
    familia.desactivar();
    const { controller, cambiarEstadoUseCase } = buildController({
      cambiarEstado: { execute: vi.fn().mockResolvedValue(Result.ok(familia)) },
    });

    const result = await controller.cambiarEstadoActivo('id-1', { activo: false });

    expect(result.activo).toBe(false);
    expect(cambiarEstadoUseCase.execute).toHaveBeenCalledWith({ id: 'id-1', activo: false });
  });

  /**
   * Sin este chequeo de metadata, borrar un `@UseGuards(AdminClienteGuard)` de
   * cualquier método de escritura deja toda la suite en verde: los tests de
   * arriba instancian el controller a mano y los guards nunca corren. Mismo
   * patrón que `sectores.controller.spec.ts`.
   */
  describe('RBAC — metadata de guards, por método, NUNCA a nivel de clase', () => {
    it.each([
      ['crear', true],
      ['editar', true],
      ['cambiarEstadoActivo', true],
      ['listar', false],
    ] as const)('%s → AdminClienteGuard presente: %s', (metodo, debeEstarPresente) => {
      const handler = FamiliasInsumoController.prototype[
        metodo as keyof typeof FamiliasInsumoController.prototype
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
