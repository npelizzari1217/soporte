/**
 * T11.1 [UNIT] — RED→GREEN: `EditarTipoTicketUseCase` (T2, PR11).
 * Edita `codigo`/`nombre`; si `codigo` cambia, revalida unicidad y colisión
 * de prefijo (mismo criterio que `CrearTipoTicketUseCase`, ADR-4).
 *
 * Ref spec: sdd/tickets-core/spec T2, T5. Ref design: ADR-4. Tarea: T11.1.
 */
import { EditarTipoTicketUseCase } from './editar-tipo-ticket.use-case';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import {
  TipoTicketNoEncontradoError,
  TipoTicketCodigoDuplicadoError,
  PrefijoTipoTicketColisionError,
} from '../../domain/errors/tickets.errors';

describe('EditarTipoTicketUseCase', () => {
  function makeCollaborators(tipo: TipoTicketEntity | null, otros: TipoTicketEntity[] = []) {
    const todos = tipo ? [tipo, ...otros] : otros;
    const tipoTicketRepo = {
      findById: vi.fn().mockResolvedValue(tipo),
      findByCodigo: vi.fn().mockImplementation(async (codigo: string) => {
        return todos.find((t) => t.codigo === codigo) ?? null;
      }),
      findAllActive: vi.fn().mockResolvedValue(todos.filter((t) => !t.isDeleted())),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new EditarTipoTicketUseCase(tipoTicketRepo as never);
    return { useCase, tipoTicketRepo };
  }

  it('actualiza el nombre sin tocar el codigo (sin revalidar unicidad/prefijo)', async () => {
    const tipo = TipoTicketEntity.create(
      { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'SOPORTE', activo: true },
      'id-1',
    );
    const c = makeCollaborators(tipo);

    const result = await c.useCase.execute({ id: 'id-1', nombre: 'Soporte Técnico' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().nombre).toBe('Soporte Técnico');
    expect(result.getValue().codigo).toBe('SOPORTE');
    expect(c.tipoTicketRepo.save).toHaveBeenCalledWith(tipo);
  });

  it('cambia el codigo cuando es único y su prefijo no colisiona', async () => {
    const tipo = TipoTicketEntity.create(
      { codigo: 'RRHH', nombre: 'RRHH', modulo: 'SOPORTE', activo: true },
      'id-1',
    );
    const c = makeCollaborators(tipo);

    const result = await c.useCase.execute({ id: 'id-1', codigo: 'RECURSOS' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().codigo).toBe('RECURSOS');
  });

  it('tipo inexistente → TipoTicketNoEncontradoError (404)', async () => {
    const c = makeCollaborators(null);

    const result = await c.useCase.execute({ id: 'no-existe', nombre: 'X' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoTicketNoEncontradoError);
  });

  it('nuevo codigo ya usado por OTRO tipo → TipoTicketCodigoDuplicadoError (422), sin persistir', async () => {
    const tipo = TipoTicketEntity.create(
      { codigo: 'RRHH', nombre: 'RRHH', modulo: 'SOPORTE', activo: true },
      'id-1',
    );
    const otro = TipoTicketEntity.create(
      { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'SOPORTE', activo: true },
      'id-2',
    );
    const c = makeCollaborators(tipo, [otro]);

    const result = await c.useCase.execute({ id: 'id-1', codigo: 'SOPORTE' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoTicketCodigoDuplicadoError);
    expect(c.tipoTicketRepo.save).not.toHaveBeenCalled();
  });

  it('nuevo codigo con prefijo que colisiona con OTRO tipo ACTIVO → PrefijoTipoTicketColisionError (422)', async () => {
    const tipo = TipoTicketEntity.create(
      { codigo: 'RRHH', nombre: 'RRHH', modulo: 'SOPORTE', activo: true },
      'id-1',
    );
    const otro = TipoTicketEntity.create(
      { codigo: 'COMPRAS', nombre: 'Compras', modulo: 'COMPRAS', activo: true },
      'id-2',
    );
    const c = makeCollaborators(tipo, [otro]);

    const result = await c.useCase.execute({ id: 'id-1', codigo: 'COMISION' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PrefijoTipoTicketColisionError);
    expect(c.tipoTicketRepo.save).not.toHaveBeenCalled();
  });

  it('re-enviar el MISMO codigo actual no dispara revalidación de duplicado contra sí mismo', async () => {
    const tipo = TipoTicketEntity.create(
      { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'SOPORTE', activo: true },
      'id-1',
    );
    const c = makeCollaborators(tipo);

    const result = await c.useCase.execute({ id: 'id-1', codigo: 'SOPORTE', nombre: 'Soporte v2' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().nombre).toBe('Soporte v2');
  });
});
