/**
 * ciclos.controller.spec.ts — TDD RED→GREEN (T9.7, PR9).
 *
 * Unit test: instancia el controller directamente con los use cases
 * mockeados (sin bootstrapear NestJS ni pasar por guards) — verifica
 * traducción HTTP ↔ use case y mapeo de errores de dominio → HttpException
 * (404 CicloVigenteNotFound/CicloClienteNotFound, 409 CicloOverlap).
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CiclosController } from './ciclos.controller';
import { Result } from '../../../shared/domain/result';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import {
  CicloClienteNotFoundError,
  CicloOverlapError,
  CicloVigenteNotFoundError,
} from '../../domain/errors/clientes.errors';

describe('CiclosController (T9.7)', () => {
  function buildController() {
    const elegirCicloTenantUseCase = { execute: vi.fn() };
    const activarCicloUseCase = { execute: vi.fn() };
    const desactivarCicloUseCase = { execute: vi.fn() };
    const listarCiclosUseCase = { execute: vi.fn() };
    const controller = new CiclosController(
      elegirCicloTenantUseCase as any,
      activarCicloUseCase as any,
      desactivarCicloUseCase as any,
      listarCiclosUseCase as any,
    );
    return {
      controller,
      elegirCicloTenantUseCase,
      activarCicloUseCase,
      desactivarCicloUseCase,
      listarCiclosUseCase,
    };
  }

  const cicloAdoptado = CicloClienteEntity.create({
    nombre: 'Ciclo 2026',
    fechaInicio: new Date('2026-01-01'),
    fechaFin: new Date('2026-12-31'),
    activo: false,
    cicloVigenteId: 'master-1',
  });

  describe('POST /ciclos', () => {
    it('elige el ciclo y retorna 201 con el DTO de respuesta (activo=false)', async () => {
      const { controller, elegirCicloTenantUseCase } = buildController();
      elegirCicloTenantUseCase.execute.mockResolvedValue(Result.ok(cicloAdoptado));

      const result = await controller.create({ cicloVigenteId: 'master-1' } as any);

      expect(result).toEqual({
        id: cicloAdoptado.id,
        nombre: 'Ciclo 2026',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-12-31',
        activo: false,
        cicloVigenteId: 'master-1',
      });
      expect(elegirCicloTenantUseCase.execute).toHaveBeenCalledWith({ cicloVigenteId: 'master-1' });
    });

    it('propaga 404 NotFoundException cuando el master no es elegible', async () => {
      const { controller, elegirCicloTenantUseCase } = buildController();
      elegirCicloTenantUseCase.execute.mockResolvedValue(
        Result.fail(new CicloVigenteNotFoundError('master-1')),
      );

      await expect(controller.create({ cicloVigenteId: 'master-1' } as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('propaga 409 ConflictException cuando hay solapamiento (CicloOverlap)', async () => {
      const { controller, elegirCicloTenantUseCase } = buildController();
      elegirCicloTenantUseCase.execute.mockResolvedValue(Result.fail(new CicloOverlapError()));

      await expect(controller.create({ cicloVigenteId: 'master-1' } as any)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('PATCH /ciclos/:id/activar', () => {
    it('activa el ciclo y retorna 200 con el DTO de respuesta (activo=true)', async () => {
      const { controller, activarCicloUseCase } = buildController();
      const activado = CicloClienteEntity.reconstitute(
        {
          nombre: 'Ciclo 2026',
          fechaInicio: new Date('2026-01-01'),
          fechaFin: new Date('2026-12-31'),
          activo: true,
          cicloVigenteId: 'master-1',
        },
        cicloAdoptado.id,
        new Date(),
        new Date(),
        null,
      );
      activarCicloUseCase.execute.mockResolvedValue(Result.ok(activado));

      const result = await controller.activar(cicloAdoptado.id);

      expect(result.activo).toBe(true);
      expect(activarCicloUseCase.execute).toHaveBeenCalledWith(cicloAdoptado.id);
    });

    it('propaga 404 NotFoundException cuando el ciclo no existe en el tenant', async () => {
      const { controller, activarCicloUseCase } = buildController();
      activarCicloUseCase.execute.mockResolvedValue(
        Result.fail(new CicloClienteNotFoundError('id-inexistente')),
      );

      await expect(controller.activar('id-inexistente')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('PATCH /ciclos/:id/desactivar', () => {
    it('desactiva el ciclo y retorna 200 con el DTO de respuesta (activo=false)', async () => {
      const { controller, desactivarCicloUseCase } = buildController();
      const desactivado = CicloClienteEntity.reconstitute(
        {
          nombre: 'Ciclo 2026',
          fechaInicio: new Date('2026-01-01'),
          fechaFin: new Date('2026-12-31'),
          activo: false,
          cicloVigenteId: 'master-1',
        },
        cicloAdoptado.id,
        new Date(),
        new Date(),
        null,
      );
      desactivarCicloUseCase.execute.mockResolvedValue(Result.ok(desactivado));

      const result = await controller.desactivar(cicloAdoptado.id);

      expect(result.activo).toBe(false);
      expect(desactivarCicloUseCase.execute).toHaveBeenCalledWith(cicloAdoptado.id);
    });

    it('propaga 404 NotFoundException cuando el ciclo no existe en el tenant', async () => {
      const { controller, desactivarCicloUseCase } = buildController();
      desactivarCicloUseCase.execute.mockResolvedValue(
        Result.fail(new CicloClienteNotFoundError('id-inexistente')),
      );

      await expect(controller.desactivar('id-inexistente')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('GET /ciclos (G4, sdd/beta-frontend)', () => {
    it('retorna los ciclos del tenant + cicloActivoId', async () => {
      const { controller, listarCiclosUseCase } = buildController();
      listarCiclosUseCase.execute.mockResolvedValue(
        Result.ok({ ciclos: [cicloAdoptado], cicloActivoId: null }),
      );

      const result = await controller.listar();

      expect(result).toEqual({
        ciclos: [
          {
            id: cicloAdoptado.id,
            nombre: 'Ciclo 2026',
            fechaInicio: '2026-01-01',
            fechaFin: '2026-12-31',
            activo: false,
            cicloVigenteId: 'master-1',
          },
        ],
        cicloActivoId: null,
      });
    });
  });
});
