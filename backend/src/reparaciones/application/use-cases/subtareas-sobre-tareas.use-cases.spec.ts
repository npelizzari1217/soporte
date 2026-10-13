/**
 * Subtareas de Edilicia sobre `tareas_ticket` (odd/tareas-con-tecnico, T3): traducen la reparación
 * o la subtarea a su ticket y delegan en los casos de uso de tareas del ticket.
 */
import { Result } from '../../../shared/domain/result';
import { ActorTarea } from '../../../tickets/application/services/tareas-ticket.reglas';
import { TareaTicketEntity } from '../../../tickets/domain/entities/tarea-ticket.entity';
import {
  TareaAccionNoPermitidaError,
  TareaNoEncontradaError,
} from '../../../tickets/domain/errors/tareas.errors';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import {
  SubtareaNoEncontradaError,
  TicketEdiliciaNoEncontradoError,
} from '../../domain/errors/reparaciones.errors';
import {
  CompletarSubtareaSobreTareaUseCase,
  CrearSubtareaSobreTareaUseCase,
  EliminarSubtareaSobreTareaUseCase,
} from './subtareas-sobre-tareas.use-cases';

const ACTOR: ActorTarea = {
  id: 'responsable-uuid',
  esAdministrador: false,
  tienePermisoVerTodos: true,
  modulosConModificacion: ['EDILICIA'],
};

const EDILICIA = TicketEdiliciaEntity.create(
  { ticketId: 'ticket-uuid', ubicacion: 'Aula 3' },
  'edilicia-uuid',
);

function tarea(ticketId = 'ticket-uuid'): TareaTicketEntity {
  return TareaTicketEntity.crear({ ticketId, descripcion: 'Cambiar la junta', orden: 0 }, 'sub-1');
}

describe('CrearSubtareaSobreTareaUseCase', () => {
  it('crea la tarea en el ticket de la reparación y devuelve el id del satélite', async () => {
    const creada = tarea();
    const crearTarea = { execute: vi.fn().mockResolvedValue(Result.ok(creada)) };
    const useCase = new CrearSubtareaSobreTareaUseCase(
      { findById: vi.fn().mockResolvedValue(EDILICIA) },
      crearTarea,
    );

    const result = await useCase.execute({
      reparacionId: 'edilicia-uuid',
      descripcion: 'Cambiar la junta',
      actor: ACTOR,
    });

    expect(result.getValue()).toEqual({ tarea: creada, ticketEdiliciaId: 'edilicia-uuid' });
    expect(crearTarea.execute).toHaveBeenCalledWith({
      ticketId: 'ticket-uuid',
      actor: ACTOR,
      descripcion: 'Cambiar la junta',
    });
  });

  it('reparación inexistente → TicketEdiliciaNoEncontradoError, sin delegar', async () => {
    const crearTarea = { execute: vi.fn() };
    const useCase = new CrearSubtareaSobreTareaUseCase(
      { findById: vi.fn().mockResolvedValue(null) },
      crearTarea,
    );

    const result = await useCase.execute({ reparacionId: 'x', descripcion: 'X', actor: ACTOR });

    expect(result.getError()).toBeInstanceOf(TicketEdiliciaNoEncontradoError);
    expect(crearTarea.execute).not.toHaveBeenCalled();
  });

  it('propaga el rechazo de la regla del punto 12 (403)', async () => {
    const useCase = new CrearSubtareaSobreTareaUseCase(
      { findById: vi.fn().mockResolvedValue(EDILICIA) },
      { execute: vi.fn().mockResolvedValue(Result.fail(new TareaAccionNoPermitidaError('crear'))) },
    );

    const result = await useCase.execute({
      reparacionId: 'edilicia-uuid',
      descripcion: 'X',
      actor: ACTOR,
    });

    expect(result.getError()).toBeInstanceOf(TareaAccionNoPermitidaError);
  });
});

describe('CompletarSubtareaSobreTareaUseCase', () => {
  function armar(opciones: {
    tarea: TareaTicketEntity | null;
    edilicia?: TicketEdiliciaEntity | null;
    resultado?: unknown;
  }) {
    const completarTarea = {
      execute: vi.fn().mockResolvedValue(opciones.resultado ?? Result.ok(opciones.tarea)),
    };
    const ediliciaRepo = {
      findByTicketId: vi
        .fn()
        .mockResolvedValue(opciones.edilicia === undefined ? EDILICIA : opciones.edilicia),
    };
    const useCase = new CompletarSubtareaSobreTareaUseCase(
      { buscarPorId: vi.fn().mockResolvedValue(opciones.tarea) },
      ediliciaRepo,
      completarTarea,
    );
    return { useCase, completarTarea };
  }

  it('completa la tarea en su ticket (el id de la subtarea es el de la tarea)', async () => {
    const existente = tarea();
    const { useCase, completarTarea } = armar({ tarea: existente });

    const result = await useCase.execute({ subtareaId: 'sub-1', actor: ACTOR });

    expect(result.getValue()).toEqual({ tarea: existente, ticketEdiliciaId: 'edilicia-uuid' });
    expect(completarTarea.execute).toHaveBeenCalledWith({
      ticketId: 'ticket-uuid',
      tareaId: 'sub-1',
      actor: ACTOR,
    });
  });

  it.each([
    ['inexistente', { tarea: null }],
    ['de un ticket que no es una reparación', { tarea: tarea('otro-ticket'), edilicia: null }],
  ])('tarea %s → SubtareaNoEncontradaError, sin delegar', async (_caso, opciones) => {
    const { useCase, completarTarea } = armar(opciones);

    const result = await useCase.execute({ subtareaId: 'sub-1', actor: ACTOR });

    expect(result.getError()).toBeInstanceOf(SubtareaNoEncontradaError);
    expect(completarTarea.execute).not.toHaveBeenCalled();
  });

  it('una tarea dada de baja → SubtareaNoEncontradaError', async () => {
    const baja = tarea();
    baja.eliminar(new Date());
    const { useCase } = armar({ tarea: baja });

    const result = await useCase.execute({ subtareaId: 'sub-1', actor: ACTOR });

    expect(result.getError()).toBeInstanceOf(SubtareaNoEncontradaError);
  });

  it('TareaNoEncontradaError del caso de uso se informa como subtarea no encontrada', async () => {
    const { useCase } = armar({
      tarea: tarea(),
      resultado: Result.fail(new TareaNoEncontradaError('sub-1')),
    });

    const result = await useCase.execute({ subtareaId: 'sub-1', actor: ACTOR });

    expect(result.getError()).toBeInstanceOf(SubtareaNoEncontradaError);
  });
});

describe('EliminarSubtareaSobreTareaUseCase', () => {
  it('borra la tarea en su ticket', async () => {
    const eliminarTarea = { execute: vi.fn().mockResolvedValue(Result.ok(undefined)) };
    const useCase = new EliminarSubtareaSobreTareaUseCase(
      { buscarPorId: vi.fn().mockResolvedValue(tarea()) },
      { findByTicketId: vi.fn().mockResolvedValue(EDILICIA) },
      eliminarTarea,
    );

    const result = await useCase.execute({ subtareaId: 'sub-1', actor: ACTOR });

    expect(result.isOk()).toBe(true);
    expect(eliminarTarea.execute).toHaveBeenCalledWith({
      ticketId: 'ticket-uuid',
      tareaId: 'sub-1',
      actor: ACTOR,
    });
  });

  it('propaga el 403 de la regla del punto 12', async () => {
    const useCase = new EliminarSubtareaSobreTareaUseCase(
      { buscarPorId: vi.fn().mockResolvedValue(tarea()) },
      { findByTicketId: vi.fn().mockResolvedValue(EDILICIA) },
      {
        execute: vi.fn().mockResolvedValue(Result.fail(new TareaAccionNoPermitidaError('borrar'))),
      },
    );

    const result = await useCase.execute({ subtareaId: 'sub-1', actor: ACTOR });

    expect(result.getError()).toBeInstanceOf(TareaAccionNoPermitidaError);
  });
});
