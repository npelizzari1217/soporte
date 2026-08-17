import { describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { SectoresController } from './sectores.controller';
import { AdminClienteGuard } from '../../../auth/infrastructure/guards/admin-cliente.guard';
import { SectorEntity } from '../../domain/entities/sector.entity';
import { Result } from '../../../shared/domain/result';
import {
  SectorNoEncontradoError,
  SectorCodigoDuplicadoError,
} from '../../domain/errors/sectores.errors';

describe('SectoresController (WU-07)', () => {
  function buildController(overrides: Record<string, { execute: ReturnType<typeof vi.fn> }> = {}) {
    const crearSectorUseCase = overrides.crear ?? { execute: vi.fn() };
    const editarSectorUseCase = overrides.editar ?? { execute: vi.fn() };
    const cambiarEstadoActivoSectorUseCase = overrides.cambiarEstado ?? { execute: vi.fn() };
    const listarSectoresUseCase = overrides.listar ?? { execute: vi.fn() };

    const controller = new SectoresController(
      crearSectorUseCase as any,
      editarSectorUseCase as any,
      cambiarEstadoActivoSectorUseCase as any,
      listarSectoresUseCase as any,
    );
    return {
      controller,
      crearSectorUseCase,
      editarSectorUseCase,
      cambiarEstadoActivoSectorUseCase,
      listarSectoresUseCase,
    };
  }

  it('GET /sectores retorna el listado mapeado a DTO', async () => {
    const sector = SectorEntity.create({ codigo: 'A', nombre: 'A', activo: true });
    const { controller } = buildController({
      listar: { execute: vi.fn().mockResolvedValue([sector]) },
    });

    const result = await controller.listar();

    expect(result).toHaveLength(1);
    expect(result[0]!.codigo).toBe('A');
  });

  it('POST /sectores crea y retorna el DTO', async () => {
    const sector = SectorEntity.create({ codigo: 'A', nombre: 'A', activo: true });
    const { controller } = buildController({
      crear: { execute: vi.fn().mockResolvedValue(Result.ok(sector)) },
    });

    const result = await controller.crear({ codigo: 'A', nombre: 'A' });

    expect(result.codigo).toBe('A');
  });

  it('POST /sectores con codigo duplicado lanza 422', async () => {
    const { controller } = buildController({
      crear: {
        execute: vi.fn().mockResolvedValue(Result.fail(new SectorCodigoDuplicadoError('A'))),
      },
    });

    await expect(controller.crear({ codigo: 'A', nombre: 'A' })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('PATCH /sectores/:id con id inexistente lanza 404', async () => {
    const { controller } = buildController({
      editar: {
        execute: vi.fn().mockResolvedValue(Result.fail(new SectorNoEncontradoError('id-x'))),
      },
    });

    await expect(controller.editar('id-x', { nombre: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('PATCH /sectores/:id/estado desactiva', async () => {
    const sector = SectorEntity.create({ codigo: 'A', nombre: 'A', activo: true });
    sector.desactivar();
    const { controller, cambiarEstadoActivoSectorUseCase } = buildController({
      cambiarEstado: { execute: vi.fn().mockResolvedValue(Result.ok(sector)) },
    });

    const result = await controller.cambiarEstadoActivo('id-1', { activo: false });

    expect(result.activo).toBe(false);
    expect(cambiarEstadoActivoSectorUseCase.execute).toHaveBeenCalledWith({
      id: 'id-1',
      activo: false,
    });
  });

  // Fix post-verify C3 (sdd/compras-tres-etapas-y-sectores): sin este chequeo
  // de metadata, borrar `@UseGuards(AdminClienteGuard)` de `editar` o de
  // `cambiarEstadoActivo` deja las 3131 pruebas del repo en verde — exacta
  // misma regresión que el commit ebe4164 (gate perdido de
  // `GET /equipos/tipos-componente`). Mismo patrón que
  // `tipos-componente.controller.spec.ts` (GUARDS_METADATA real, no mock).
  describe('RBAC — metadata de guards (S64), por método, NUNCA a nivel de clase', () => {
    it.each([
      ['crear', true],
      ['editar', true],
      ['cambiarEstadoActivo', true],
      ['listar', false],
    ] as const)('%s → AdminClienteGuard presente: %s', (metodo, debeEstarPresente) => {
      const handler = SectoresController.prototype[
        metodo as keyof typeof SectoresController.prototype
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
