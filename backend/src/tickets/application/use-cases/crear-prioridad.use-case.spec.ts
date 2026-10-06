/**
 * T11.2 [UNIT] — RED→GREEN: `CrearPrioridadUseCase` (T2, PR11 — CRUD
 * catálogos editables). Sin validación de prefijo (solo aplica a
 * TipoTicket, ADR-4) — únicamente valida unicidad de `codigo`.
 *
 * Ref spec: sdd/tickets-core/spec T2. Tarea: T11.2.
 */
import { CrearPrioridadUseCase } from './crear-prioridad.use-case';
import { PrioridadEntity } from '../../domain/entities/prioridad.entity';
import { PrioridadCodigoDuplicadaError } from '../../domain/errors/tickets.errors';

describe('CrearPrioridadUseCase', () => {
  function makeCollaborators(existentes: PrioridadEntity[] = []) {
    const prioridadRepo = {
      findByCodigo: vi.fn().mockImplementation(async (codigo: string) => {
        return existentes.find((p) => p.codigo === codigo) ?? null;
      }),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new CrearPrioridadUseCase(prioridadRepo as never);
    return { useCase, prioridadRepo };
  }

  it('crea la prioridad y la persiste cuando el codigo es único', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute({
      codigo: 'URGENTE',
      nombre: 'Urgente',
      color: '#FF00FF',
      orden: 50,
    });

    expect(result.isOk()).toBe(true);
    const prioridad = result.getValue();
    expect(prioridad.codigo).toBe('URGENTE');
    expect(prioridad.color).toBe('#FF00FF');
    expect(prioridad.orden).toBe(50);
    expect(prioridad.activo).toBe(true);
    expect(c.prioridadRepo.save).toHaveBeenCalledWith(prioridad);
  });

  it('acepta color null', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute({ codigo: 'URGENTE', nombre: 'Urgente', orden: 50 });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().color).toBeNull();
  });

  it('slaHoras/slaActivo omitidos → slaHoras null (sin SLA aplicable), slaActivo true', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute({ codigo: 'URGENTE', nombre: 'Urgente', orden: 50 });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().slaHoras).toBeNull();
    expect(result.getValue().slaActivo).toBe(true);
  });

  it('acepta slaHoras/slaActivo explícitos', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute({
      codigo: 'URGENTE',
      nombre: 'Urgente',
      orden: 50,
      slaHoras: 8,
      slaActivo: false,
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().slaHoras).toBe(8);
    expect(result.getValue().slaActivo).toBe(false);
  });

  it('slaPrimeraRespuestaHoras 4 guarda 4 h; omitido o null guarda sin meta', async () => {
    const c = makeCollaborators();

    const con = await c.useCase.execute({
      codigo: 'URGENTE',
      nombre: 'Urgente',
      orden: 50,
      slaPrimeraRespuestaHoras: 4,
    });
    const sin = await c.useCase.execute({ codigo: 'BAJA2', nombre: 'Baja 2', orden: 60 });
    const nula = await c.useCase.execute({
      codigo: 'BAJA3',
      nombre: 'Baja 3',
      orden: 70,
      slaPrimeraRespuestaHoras: null,
    });

    expect(con.getValue().slaPrimeraRespuestaHoras).toBe(4);
    expect(sin.getValue().slaPrimeraRespuestaHoras).toBeNull();
    expect(nula.getValue().slaPrimeraRespuestaHoras).toBeNull();
  });

  it('codigo ya existente (activa o soft-deleted) → PrioridadCodigoDuplicadaError (422), sin persistir', async () => {
    const existente = PrioridadEntity.create({
      codigo: 'ALTA',
      nombre: 'Alta',
      color: null,
      orden: 30,
      activo: true,
    });
    const c = makeCollaborators([existente]);

    const result = await c.useCase.execute({ codigo: 'ALTA', nombre: 'Duplicada', orden: 1 });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PrioridadCodigoDuplicadaError);
    expect(c.prioridadRepo.save).not.toHaveBeenCalled();
  });
});
