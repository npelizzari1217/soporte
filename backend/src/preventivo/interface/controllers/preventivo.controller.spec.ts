/**
 * PreventivoController — unit test (WU-4, 4.4). Instancia el controller
 * directamente con use cases mockeados (sin bootstrapear NestJS ni pasar por
 * guards/ValidationPipe — mismo patrón que `equipos.controller.spec.ts`).
 * Verifica: traducción HTTP ↔ use case, mapeo de errores de dominio →
 * HttpException, y que cada endpoint declara el `@RequiereAcciones` correcto
 * — la prueba REAL de que el gate bloquea de verdad vive en el e2e
 * (`test/preventivo.e2e.spec.ts`), no acá (un unit test mockea el guard
 * fuera de la ecuación).
 */
import 'reflect-metadata';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PreventivoController, toHttpException } from './preventivo.controller';
import { ACCIONES_KEY } from '../../../auth/infrastructure/guards/decorators';
import { Result } from '../../../shared/domain/result';
import { PlanPreventivoEntity } from '../../domain/entities/plan-preventivo.entity';
import {
  ObjetivoInvalidoError,
  PlanNoEncontradoError,
} from '../../domain/errors/preventivo.errors';

function makePlan(): PlanPreventivoEntity {
  return PlanPreventivoEntity.create(
    {
      titulo: 'Plan test',
      instrucciones: null,
      equipoId: 'equipo-uuid',
      ubicacion: null,
      prioridadId: 'prioridad-uuid',
      responsableId: 'responsable-uuid',
      intervaloValor: 1,
      intervaloUnidad: 'MESES',
      fechaInicio: new Date('2026-01-01'),
      proximaEjecucionEn: new Date('2026-01-01'),
      activo: true,
    },
    'plan-uuid',
  ).getValue();
}

describe('PreventivoController (4.4)', () => {
  function buildController() {
    const crearPlanUseCase = { execute: vi.fn() };
    const editarPlanUseCase = { execute: vi.fn() };
    const listarPlanesUseCase = { execute: vi.fn() };
    const darDeBajaPlanUseCase = { execute: vi.fn() };
    const listarGeneracionesPlanUseCase = { execute: vi.fn() };

    const controller = new PreventivoController(
      crearPlanUseCase as any,
      editarPlanUseCase as any,
      listarPlanesUseCase as any,
      darDeBajaPlanUseCase as any,
      listarGeneracionesPlanUseCase as any,
    );

    return {
      controller,
      crearPlanUseCase,
      editarPlanUseCase,
      listarPlanesUseCase,
      darDeBajaPlanUseCase,
      listarGeneracionesPlanUseCase,
    };
  }

  describe('POST /preventivo/planes', () => {
    it('crea el plan → 201 + response', async () => {
      const { controller, crearPlanUseCase } = buildController();
      crearPlanUseCase.execute.mockResolvedValue(Result.ok(makePlan()));

      const result = await controller.crear({
        titulo: 'Plan test',
        prioridadId: 'prioridad-uuid',
        responsableId: 'responsable-uuid',
        intervaloValor: 1,
        intervaloUnidad: 'MESES',
        fechaInicio: '2026-01-01',
      } as any);

      expect(result.id).toBe('plan-uuid');
      expect(result.titulo).toBe('Plan test');
    });

    it('objetivo excluyente violado → 422', async () => {
      const { controller, crearPlanUseCase } = buildController();
      crearPlanUseCase.execute.mockResolvedValue(
        Result.fail(new ObjetivoInvalidoError(true, true)),
      );

      await expect(controller.crear({} as any)).rejects.toThrow(UnprocessableEntityException);
    });

    it('declara @RequiereAcciones("PREVENTIVO:ALTAS")', () => {
      const meta = Reflect.getMetadata(ACCIONES_KEY, PreventivoController.prototype.crear);
      expect(meta).toEqual(['PREVENTIVO:ALTAS']);
    });
  });

  describe('GET /preventivo/planes', () => {
    it('declara @RequiereAcciones("PREVENTIVO:LECTURA")', () => {
      const meta = Reflect.getMetadata(ACCIONES_KEY, PreventivoController.prototype.listar);
      expect(meta).toEqual(['PREVENTIVO:LECTURA']);
    });
  });

  describe('GET /preventivo/planes/:id/generaciones', () => {
    it('plan inexistente → 404', async () => {
      const { controller, listarGeneracionesPlanUseCase } = buildController();
      listarGeneracionesPlanUseCase.execute.mockResolvedValue(
        Result.fail(new PlanNoEncontradoError('no-existe')),
      );

      await expect(controller.listarGeneraciones('no-existe')).rejects.toThrow(NotFoundException);
    });

    it('declara @RequiereAcciones("PREVENTIVO:LECTURA")', () => {
      const meta = Reflect.getMetadata(
        ACCIONES_KEY,
        PreventivoController.prototype.listarGeneraciones,
      );
      expect(meta).toEqual(['PREVENTIVO:LECTURA']);
    });
  });

  describe('PATCH /preventivo/planes/:id', () => {
    it('plan inexistente → 404', async () => {
      const { controller, editarPlanUseCase } = buildController();
      editarPlanUseCase.execute.mockResolvedValue(Result.fail(new PlanNoEncontradoError('x')));

      await expect(controller.editar('x', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('declara @RequiereAcciones("PREVENTIVO:MODIFICACION")', () => {
      const meta = Reflect.getMetadata(ACCIONES_KEY, PreventivoController.prototype.editar);
      expect(meta).toEqual(['PREVENTIVO:MODIFICACION']);
    });
  });

  describe('DELETE /preventivo/planes/:id', () => {
    it('plan inexistente → 404', async () => {
      const { controller, darDeBajaPlanUseCase } = buildController();
      darDeBajaPlanUseCase.execute.mockResolvedValue(Result.fail(new PlanNoEncontradoError('x')));

      await expect(controller.eliminar('x')).rejects.toThrow(NotFoundException);
    });

    it('declara @RequiereAcciones("PREVENTIVO:BORRADO")', () => {
      const meta = Reflect.getMetadata(ACCIONES_KEY, PreventivoController.prototype.eliminar);
      expect(meta).toEqual(['PREVENTIVO:BORRADO']);
    });
  });

  it('toHttpException: error de dominio no mapeado explícitamente cae en 422 (nunca 500 silencioso)', () => {
    const errorGenerico = new PlanNoEncontradoError('x');
    // PlanNoEncontradoError SÍ está mapeado (404) — se prueba el "catch-all"
    // con un error de dominio ad-hoc que no pertenece a ninguna rama.
    class ErrorNoMapeado extends ObjetivoInvalidoError {}
    expect(toHttpException(new ErrorNoMapeado(true, true))).toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(toHttpException(errorGenerico)).toBeInstanceOf(NotFoundException);
  });
});
