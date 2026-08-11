/**
 * T11.1 [UNIT] — RED→GREEN: `CambiarEstadoActivoTipoTicketUseCase` (T2,
 * PR11 — activar/desactivar; dar de baja NO rompe tickets existentes).
 *
 * Ref spec: sdd/tickets-core/spec T2. Tarea: T11.1.
 */
import { CambiarEstadoActivoTipoTicketUseCase } from './cambiar-estado-activo-tipo-ticket.use-case';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import { TipoTicketNoEncontradoError } from '../../domain/errors/tickets.errors';

describe('CambiarEstadoActivoTipoTicketUseCase', () => {
  function makeCollaborators(tipo: TipoTicketEntity | null) {
    const tipoTicketRepo = {
      findById: vi.fn().mockResolvedValue(tipo),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new CambiarEstadoActivoTipoTicketUseCase(tipoTicketRepo as never);
    return { useCase, tipoTicketRepo };
  }

  it('activo:false da de baja (soft delete) el tipo y persiste', async () => {
    const tipo = TipoTicketEntity.create(
      { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'SOPORTE', activo: true },
      'id-1',
    );
    const c = makeCollaborators(tipo);

    const result = await c.useCase.execute({ id: 'id-1', activo: false });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().isDeleted()).toBe(true);
    expect(result.getValue().activo).toBe(false);
    expect(c.tipoTicketRepo.save).toHaveBeenCalledWith(tipo);
  });

  it('activo:true reactiva un tipo dado de baja', async () => {
    const tipo = TipoTicketEntity.create(
      { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'SOPORTE', activo: true },
      'id-1',
    );
    tipo.desactivar();
    const c = makeCollaborators(tipo);

    const result = await c.useCase.execute({ id: 'id-1', activo: true });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().isDeleted()).toBe(false);
    expect(result.getValue().activo).toBe(true);
  });

  it('tipo inexistente → TipoTicketNoEncontradoError (404)', async () => {
    const c = makeCollaborators(null);

    const result = await c.useCase.execute({ id: 'no-existe', activo: false });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoTicketNoEncontradoError);
    expect(c.tipoTicketRepo.save).not.toHaveBeenCalled();
  });
});
