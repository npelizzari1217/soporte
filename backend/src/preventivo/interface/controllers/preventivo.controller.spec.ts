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
import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PreventivoController, toHttpException } from './preventivo.controller';
import { ACCIONES_KEY } from '../../../auth/infrastructure/guards/decorators';
import { Result } from '../../../shared/domain/result';
import { PlanPreventivoEntity } from '../../domain/entities/plan-preventivo.entity';
import { CrearPlanUseCase } from '../../application/use-cases/crear-plan.use-case';
import { EditarPlanUseCase } from '../../application/use-cases/editar-plan.use-case';
import { ListarPlanesUseCase } from '../../application/use-cases/listar-planes.use-case';
import { DarDeBajaPlanUseCase } from '../../application/use-cases/dar-de-baja-plan.use-case';
import { ListarGeneracionesPlanUseCase } from '../../application/use-cases/listar-generaciones-plan.use-case';
import { ListarResponsablesPlanUseCase } from '../../application/use-cases/listar-responsables-plan.use-case';
import {
  ObjetivoInvalidoError,
  PlanNoEncontradoError,
  ResponsableNoElegibleError,
} from '../../domain/errors/preventivo.errors';
import { espiado } from '../../../shared/test-helpers/espiado';
import { payloadDeTest } from '../../../auth/test-helpers/payload-de-test';

/** Actor del tenant `cliente-1` con las celdas pedidas (rol no administrador: sin bypass). */
function actorCon(permisos: string[]) {
  return payloadDeTest({ sub: 'actor-1', cliente_id: 'cliente-1', rol: 'TECNICO', permisos });
}

const ACTOR = actorCon(['PREVENTIVO:ALTAS', 'PREVENTIVO:MODIFICACION']);

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

/** Body completo: el caso de error depende del use case (mockeado), no del contenido. */
const DTO_CREAR_VALIDO = {
  titulo: 'Plan test',
  prioridadId: 'prioridad-uuid',
  responsableId: 'responsable-uuid',
  intervaloValor: 1,
  intervaloUnidad: 'MESES' as const,
  fechaInicio: '2026-01-01',
};

describe('PreventivoController (4.4)', () => {
  function buildController() {
    const crearPlan = espiado(CrearPlanUseCase);
    const editarPlan = espiado(EditarPlanUseCase);
    const listarPlanes = espiado(ListarPlanesUseCase);
    const darDeBajaPlan = espiado(DarDeBajaPlanUseCase);
    const listarGeneracionesPlan = espiado(ListarGeneracionesPlanUseCase);
    const listarResponsablesPlan = espiado(ListarResponsablesPlanUseCase);

    const controller = new PreventivoController(
      crearPlan.caso,
      editarPlan.caso,
      listarPlanes.caso,
      darDeBajaPlan.caso,
      listarGeneracionesPlan.caso,
      listarResponsablesPlan.caso,
    );

    return {
      controller,
      crearPlanUseCase: crearPlan,
      editarPlanUseCase: editarPlan,
      listarPlanesUseCase: listarPlanes,
      darDeBajaPlanUseCase: darDeBajaPlan,
      listarGeneracionesPlanUseCase: listarGeneracionesPlan,
      listarResponsablesPlanUseCase: listarResponsablesPlan,
    };
  }

  describe('POST /preventivo/planes', () => {
    it('crea el plan → 201 + response', async () => {
      const { controller, crearPlanUseCase } = buildController();
      crearPlanUseCase.execute.mockResolvedValue(Result.ok(makePlan()));

      const result = await controller.crear(ACTOR, {
        titulo: 'Plan test',
        prioridadId: 'prioridad-uuid',
        responsableId: 'responsable-uuid',
        intervaloValor: 1,
        intervaloUnidad: 'MESES',
        fechaInicio: '2026-01-01',
      });

      expect(result.id).toBe('plan-uuid');
      expect(result.titulo).toBe('Plan test');
      expect(crearPlanUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ clienteId: 'cliente-1', responsableId: 'responsable-uuid' }),
      );
    });

    it('responsable no elegible → 422', async () => {
      const { controller, crearPlanUseCase } = buildController();
      crearPlanUseCase.execute.mockResolvedValue(Result.fail(new ResponsableNoElegibleError()));

      await expect(controller.crear(ACTOR, DTO_CREAR_VALIDO)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('objetivo excluyente violado → 422', async () => {
      const { controller, crearPlanUseCase } = buildController();
      crearPlanUseCase.execute.mockResolvedValue(
        Result.fail(new ObjetivoInvalidoError(true, true)),
      );

      await expect(controller.crear(ACTOR, DTO_CREAR_VALIDO)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('declara @RequiereAcciones("PREVENTIVO:ALTAS")', () => {
      const meta = Reflect.getMetadata(ACCIONES_KEY, PreventivoController.prototype.crear);
      expect(meta).toEqual(['PREVENTIVO:ALTAS']);
    });
  });

  describe('GET /preventivo/planes', () => {
    it('use case falla → excepción HTTP mapeada, nunca 500 crudo', async () => {
      const { controller, listarPlanesUseCase } = buildController();
      listarPlanesUseCase.execute.mockResolvedValue(
        Result.fail(new ObjetivoInvalidoError(true, true)),
      );

      await expect(controller.listar()).rejects.toThrow(UnprocessableEntityException);
    });

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

      await expect(controller.editar(ACTOR, 'x', {})).rejects.toThrow(NotFoundException);
    });

    it('delega con el clienteId del JWT; responsable nuevo no elegible → 422', async () => {
      const { controller, editarPlanUseCase } = buildController();
      editarPlanUseCase.execute.mockResolvedValue(Result.fail(new ResponsableNoElegibleError()));

      await expect(
        controller.editar(ACTOR, 'plan-uuid', { responsableId: 'otro-uuid' }),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(editarPlanUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          clienteId: 'cliente-1',
          planId: 'plan-uuid',
          responsableId: 'otro-uuid',
        }),
      );
    });

    it('declara @RequiereAcciones("PREVENTIVO:MODIFICACION")', () => {
      const meta = Reflect.getMetadata(ACCIONES_KEY, PreventivoController.prototype.editar);
      expect(meta).toEqual(['PREVENTIVO:MODIFICACION']);
    });
  });

  describe('GET /preventivo/planes/responsables', () => {
    const TECNICOS = [{ id: 'tec-1', nombre: 'Ana', apellido: 'García' }];

    it.each([
      ['PREVENTIVO:ALTAS', ['PREVENTIVO:ALTAS']],
      ['PREVENTIVO:MODIFICACION', ['PREVENTIVO:MODIFICACION']],
    ])('con %s → delega con el clienteId del JWT y devuelve la lista', async (_caso, permisos) => {
      const { controller, listarResponsablesPlanUseCase } = buildController();
      listarResponsablesPlanUseCase.execute.mockResolvedValue(Result.ok(TECNICOS));

      const res = await controller.listarResponsables(actorCon(permisos));

      expect(res).toEqual(TECNICOS);
      expect(listarResponsablesPlanUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-1',
      });
    });

    it('sin PREVENTIVO:ALTAS ni PREVENTIVO:MODIFICACION → 403, sin consultar', async () => {
      const { controller, listarResponsablesPlanUseCase } = buildController();

      await expect(
        controller.listarResponsables(actorCon(['PREVENTIVO:LECTURA', 'PREVENTIVO:BORRADO'])),
      ).rejects.toThrow(ForbiddenException);
      expect(listarResponsablesPlanUseCase.execute).not.toHaveBeenCalled();
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
