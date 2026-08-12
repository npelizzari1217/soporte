/**
 * T11.2 [UNIT] — RED→GREEN: `EditarPrioridadUseCase` (T2, PR11).
 *
 * Ref spec: sdd/tickets-core/spec T2. Tarea: T11.2.
 */
import { EditarPrioridadUseCase } from './editar-prioridad.use-case';
import { PrioridadEntity } from '../../domain/entities/prioridad.entity';
import {
  PrioridadNoEncontradaError,
  PrioridadCodigoDuplicadaError,
} from '../../domain/errors/tickets.errors';

function make(codigo: string, id: string): PrioridadEntity {
  return PrioridadEntity.create(
    { codigo, nombre: codigo, color: null, orden: 10, activo: true },
    id,
  );
}

describe('EditarPrioridadUseCase', () => {
  function makeCollaborators(prioridad: PrioridadEntity | null, otras: PrioridadEntity[] = []) {
    const todas = prioridad ? [prioridad, ...otras] : otras;
    const prioridadRepo = {
      findById: vi.fn().mockResolvedValue(prioridad),
      findByCodigo: vi.fn().mockImplementation(async (codigo: string) => {
        return todas.find((p) => p.codigo === codigo) ?? null;
      }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new EditarPrioridadUseCase(prioridadRepo as never);
    return { useCase, prioridadRepo };
  }

  it('actualiza nombre/color/orden sin tocar el codigo', async () => {
    const prioridad = make('ALTA', 'id-1');
    const c = makeCollaborators(prioridad);

    const result = await c.useCase.execute({ id: 'id-1', nombre: 'Alta Prioridad', orden: 35 });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().nombre).toBe('Alta Prioridad');
    expect(result.getValue().orden).toBe(35);
    expect(result.getValue().codigo).toBe('ALTA');
    expect(c.prioridadRepo.save).toHaveBeenCalledWith(prioridad);
  });

  it('cambia el codigo cuando es único', async () => {
    const prioridad = make('ALTA', 'id-1');
    const c = makeCollaborators(prioridad);

    const result = await c.useCase.execute({ id: 'id-1', codigo: 'MUY_ALTA' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().codigo).toBe('MUY_ALTA');
  });

  it('prioridad inexistente → PrioridadNoEncontradaError (404)', async () => {
    const c = makeCollaborators(null);

    const result = await c.useCase.execute({ id: 'no-existe', nombre: 'X' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PrioridadNoEncontradaError);
  });

  it('nuevo codigo ya usado por OTRA prioridad → PrioridadCodigoDuplicadaError (422), sin persistir', async () => {
    const prioridad = make('ALTA', 'id-1');
    const otra = make('MEDIA', 'id-2');
    const c = makeCollaborators(prioridad, [otra]);

    const result = await c.useCase.execute({ id: 'id-1', codigo: 'MEDIA' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PrioridadCodigoDuplicadaError);
    expect(c.prioridadRepo.save).not.toHaveBeenCalled();
  });

  it('re-enviar el MISMO codigo actual no dispara revalidación de duplicado contra sí misma', async () => {
    const prioridad = make('ALTA', 'id-1');
    const c = makeCollaborators(prioridad);

    const result = await c.useCase.execute({ id: 'id-1', codigo: 'ALTA', nombre: 'Alta v2' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().nombre).toBe('Alta v2');
  });

  it('edita slaHoras/slaActivo (SLA movido de sla_config a prioridades)', async () => {
    const prioridad = make('ALTA', 'id-1');
    const c = makeCollaborators(prioridad);

    const result = await c.useCase.execute({ id: 'id-1', slaHoras: 8, slaActivo: false });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().slaHoras).toBe(8);
    expect(result.getValue().slaActivo).toBe(false);
  });

  it('slaHoras:null limpia el SLA explícitamente (sin SLA aplicable)', async () => {
    const prioridad = PrioridadEntity.create(
      {
        codigo: 'ALTA',
        nombre: 'ALTA',
        color: null,
        orden: 10,
        activo: true,
        slaHoras: 8,
        slaActivo: true,
      },
      'id-1',
    );
    const c = makeCollaborators(prioridad);

    const result = await c.useCase.execute({ id: 'id-1', slaHoras: null });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().slaHoras).toBeNull();
  });
});
