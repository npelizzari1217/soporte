/**
 * ciclos-vigentes.controller.spec.ts — TDD RED→GREEN (T9.3, PR9).
 *
 * Unit test: instancia el controller directamente con el use case mockeado
 * (sin bootstrapear NestJS ni pasar por guards) — verifica traducción
 * HTTP ↔ use case y mapeo Result.fail → HttpException.
 */
import { UnprocessableEntityException } from '@nestjs/common';
import { CicloVigenteController } from './ciclos-vigentes.controller';
import { Result } from '../../../shared/domain/result';
import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';
import { CicloVigenteInvalidDatesError } from '../../domain/errors/clientes.errors';

describe('CicloVigenteController (T9.3, item 4/G6)', () => {
  function buildController() {
    const crearCicloVigenteUseCase = { execute: vi.fn() };
    const listarCiclosVigentesUseCase = { execute: vi.fn() };
    const controller = new CicloVigenteController(
      crearCicloVigenteUseCase as any,
      listarCiclosVigentesUseCase as any,
    );
    return { controller, crearCicloVigenteUseCase, listarCiclosVigentesUseCase };
  }

  describe('POST /ciclos-vigentes', () => {
    it('crea el ciclo y retorna 201 con el DTO de respuesta', async () => {
      const { controller, crearCicloVigenteUseCase } = buildController();
      const ciclo = CicloVigenteEntity.create({
        nombre: 'Ciclo 2026',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: true,
      });
      crearCicloVigenteUseCase.execute.mockResolvedValue(Result.ok(ciclo));

      const result = await controller.create({
        nombre: 'Ciclo 2026',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-12-31',
      } as any);

      expect(result).toEqual({
        id: ciclo.id,
        nombre: 'Ciclo 2026',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-12-31',
        activo: true,
      });
      expect(crearCicloVigenteUseCase.execute).toHaveBeenCalledWith({
        nombre: 'Ciclo 2026',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
      });
    });

    it('propaga 422 UnprocessableEntityException cuando el use case falla', async () => {
      const { controller, crearCicloVigenteUseCase } = buildController();
      crearCicloVigenteUseCase.execute.mockResolvedValue(
        Result.fail(new CicloVigenteInvalidDatesError()),
      );

      await expect(
        controller.create({
          nombre: 'Ciclo inválido',
          fechaInicio: '2026-12-31',
          fechaFin: '2026-01-01',
        } as any),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('GET /ciclos-vigentes (item 4/G6)', () => {
    it('lista los ciclos activos mapeados al DTO de respuesta', async () => {
      const { controller, listarCiclosVigentesUseCase } = buildController();
      const ciclo = CicloVigenteEntity.create({
        nombre: 'Ciclo 2026',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: true,
      });
      listarCiclosVigentesUseCase.execute.mockResolvedValue([ciclo]);

      const result = await controller.listar();

      expect(result).toEqual([
        {
          id: ciclo.id,
          nombre: 'Ciclo 2026',
          fechaInicio: '2026-01-01',
          fechaFin: '2026-12-31',
          activo: true,
        },
      ]);
    });
  });
});
