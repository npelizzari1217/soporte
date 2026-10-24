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
  AccionSobreTipoDelPlanNoPermitidaError,
  AnticipacionNoMenorQueCadenciaError,
  ObjetivoInvalidoError,
  PlanNoEncontradoError,
  ResponsableNoElegibleError,
} from '../../domain/errors/preventivo.errors';
import { TipoTicketNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';
import { CargadorAlcanceTicket } from '../../../tickets/interface/alcance-ticket';
import { PermisosTipoTicketEnMemoria } from '../../../tickets/test-helpers/permisos-tipo-ticket-en-memoria';
import { alcancePorTipo } from '../../../tickets/test-helpers/alcance-ticket';
import { espiado } from '../../../shared/test-helpers/espiado';
import { payloadDeTest } from '../../../auth/test-helpers/payload-de-test';

const TIPO_ID = '00000000-0000-4000-8000-0000000000a1';

/** Lo que `CargadorAlcanceTicket` arma para `actor-1` con la fila de la tabla en memoria. */
const ALCANCE_ACTOR = alcancePorTipo('actor-1', { [TIPO_ID]: ['LECTURA'] });

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
      tipoId: TIPO_ID,
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
  tipoId: TIPO_ID,
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

    // Cargador real sobre la tabla en memoria: el alcance que llega al caso de uso es el del actor.
    const alcances = new CargadorAlcanceTicket(
      new PermisosTipoTicketEnMemoria(
        [],
        [
          { usuarioId: 'actor-1', tipoId: TIPO_ID, accion: 'LECTURA' },
          { usuarioId: 'otro-actor', tipoId: 'otro-tipo', accion: 'LECTURA' },
        ],
      ),
    );
    const controller = new PreventivoController(
      crearPlan.caso,
      editarPlan.caso,
      listarPlanes.caso,
      darDeBajaPlan.caso,
      listarGeneracionesPlan.caso,
      listarResponsablesPlan.caso,
      alcances,
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

      const result = await controller.crear(ACTOR, DTO_CREAR_VALIDO);

      expect(result.id).toBe('plan-uuid');
      expect(result.titulo).toBe('Plan test');
      expect(result.tipoId).toBe(TIPO_ID);
      expect(crearPlanUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          clienteId: 'cliente-1',
          responsableId: 'responsable-uuid',
          tipoId: TIPO_ID,
          alcance: ALCANCE_ACTOR,
        }),
      );
    });

    it('tipo elegido sin LECTURA para el actor → 403 con el mensaje del caso de uso', async () => {
      const { controller, crearPlanUseCase } = buildController();
      const error = new AccionSobreTipoDelPlanNoPermitidaError('LECTURA');
      crearPlanUseCase.execute.mockResolvedValue(Result.fail(error));

      await expect(controller.crear(ACTOR, DTO_CREAR_VALIDO)).rejects.toThrow(
        new ForbiddenException(error.message),
      );
    });

    it('tipo elegido dado de baja → 422, como el alta de un ticket', async () => {
      const { controller, crearPlanUseCase } = buildController();
      crearPlanUseCase.execute.mockResolvedValue(
        Result.fail(new TipoTicketNoEncontradoError(TIPO_ID)),
      );

      await expect(controller.crear(ACTOR, DTO_CREAR_VALIDO)).rejects.toThrow(
        UnprocessableEntityException,
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

    it('pasa la anticipación al caso de uso y la devuelve en la respuesta', async () => {
      const { controller, crearPlanUseCase } = buildController();
      crearPlanUseCase.execute.mockResolvedValue(Result.ok(makePlan()));

      const result = await controller.crear(ACTOR, {
        ...DTO_CREAR_VALIDO,
        anticipacionValor: 0,
        anticipacionUnidad: 'DIAS',
      });

      expect(crearPlanUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ anticipacionValor: 0, anticipacionUnidad: 'DIAS' }),
      );
      expect(result.anticipacionValor).toBe(0);
      expect(result.anticipacionUnidad).toBe('DIAS');
    });

    it('anticipación no menor que la cadencia → 422 con el mensaje del dominio', async () => {
      const { controller, crearPlanUseCase } = buildController();
      const error = new AnticipacionNoMenorQueCadenciaError('30 días', '30 días');
      crearPlanUseCase.execute.mockResolvedValue(Result.fail(error));

      await expect(controller.crear(ACTOR, DTO_CREAR_VALIDO)).rejects.toThrow(
        new UnprocessableEntityException(error.message),
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

      await expect(controller.listar(ACTOR)).rejects.toThrow(UnprocessableEntityException);
    });

    it('pasa al caso de uso el alcance por tipo del actor (S1)', async () => {
      const { controller, listarPlanesUseCase } = buildController();
      listarPlanesUseCase.execute.mockResolvedValue(Result.ok([makePlan()]));

      const res = await controller.listar(ACTOR);

      expect(res.map((plan) => plan.id)).toEqual(['plan-uuid']);
      expect(listarPlanesUseCase.execute).toHaveBeenCalledWith({ alcance: ALCANCE_ACTOR });
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

      await expect(controller.listarGeneraciones(ACTOR, 'no-existe')).rejects.toThrow(
        NotFoundException,
      );
      expect(listarGeneracionesPlanUseCase.execute).toHaveBeenCalledWith({
        planId: 'no-existe',
        alcance: ALCANCE_ACTOR,
      });
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
          alcance: ALCANCE_ACTOR,
        }),
      );
    });

    it('pasa el tipo nuevo; tipo nuevo sin LECTURA para el actor → 403', async () => {
      const { controller, editarPlanUseCase } = buildController();
      editarPlanUseCase.execute.mockResolvedValue(
        Result.fail(new AccionSobreTipoDelPlanNoPermitidaError('LECTURA')),
      );

      await expect(controller.editar(ACTOR, 'plan-uuid', { tipoId: 'otro-tipo' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(editarPlanUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ planId: 'plan-uuid', tipoId: 'otro-tipo' }),
      );
    });

    it('pasa la anticipación al caso de uso (PATCH semántico)', async () => {
      const { controller, editarPlanUseCase } = buildController();
      editarPlanUseCase.execute.mockResolvedValue(Result.ok(makePlan()));

      await controller.editar(ACTOR, 'plan-uuid', {
        anticipacionValor: 2,
        anticipacionUnidad: 'DIAS',
      });

      expect(editarPlanUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: 'plan-uuid',
          anticipacionValor: 2,
          anticipacionUnidad: 'DIAS',
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

      const res = await controller.listarResponsables(actorCon(permisos), { tipoId: TIPO_ID });

      expect(res).toEqual(TECNICOS);
      expect(listarResponsablesPlanUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-1',
        tipoId: TIPO_ID,
        alcance: ALCANCE_ACTOR,
      });
    });

    it('sin PREVENTIVO:ALTAS ni PREVENTIVO:MODIFICACION → 403, sin consultar', async () => {
      const { controller, listarResponsablesPlanUseCase } = buildController();

      await expect(
        controller.listarResponsables(actorCon(['PREVENTIVO:LECTURA', 'PREVENTIVO:BORRADO']), {
          tipoId: TIPO_ID,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(listarResponsablesPlanUseCase.execute).not.toHaveBeenCalled();
    });

    it('con la celda pero sin LECTURA sobre el tipo pedido → 403 del caso de uso', async () => {
      const { controller, listarResponsablesPlanUseCase } = buildController();
      listarResponsablesPlanUseCase.execute.mockResolvedValue(
        Result.fail(new AccionSobreTipoDelPlanNoPermitidaError('LECTURA')),
      );

      await expect(controller.listarResponsables(ACTOR, { tipoId: 'otro-tipo' })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('DELETE /preventivo/planes/:id', () => {
    it('plan inexistente → 404', async () => {
      const { controller, darDeBajaPlanUseCase } = buildController();
      darDeBajaPlanUseCase.execute.mockResolvedValue(Result.fail(new PlanNoEncontradoError('x')));

      await expect(controller.eliminar(ACTOR, 'x')).rejects.toThrow(NotFoundException);
      expect(darDeBajaPlanUseCase.execute).toHaveBeenCalledWith({
        planId: 'x',
        alcance: ALCANCE_ACTOR,
      });
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
