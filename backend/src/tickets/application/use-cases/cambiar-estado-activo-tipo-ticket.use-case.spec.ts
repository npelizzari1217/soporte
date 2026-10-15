/**
 * T11.1 [UNIT] — RED→GREEN: `CambiarEstadoActivoTipoTicketUseCase` (T2,
 * PR11 — activar/desactivar; dar de baja NO rompe tickets existentes).
 *
 * Ref spec: sdd/tickets-core/spec T2. Tarea: T11.1.
 */
import { CambiarEstadoActivoTipoTicketUseCase } from './cambiar-estado-activo-tipo-ticket.use-case';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import {
  TipoTicketDelSistemaError,
  TipoTicketNoEncontradoError,
} from '../../domain/errors/tickets.errors';
import { TIPOS_TICKET_DEL_SISTEMA } from '../../domain/tipos-ticket.constants';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';

describe('CambiarEstadoActivoTipoTicketUseCase', () => {
  function makeCollaborators(tipo: TipoTicketEntity | null) {
    const tipoTicketRepo = {
      findById: vi.fn<ITipoTicketRepository['findById']>().mockResolvedValue(tipo),
      save: vi.fn<ITipoTicketRepository['save']>().mockResolvedValue(undefined),
    };
    const useCase = new CambiarEstadoActivoTipoTicketUseCase(tipoTicketRepo);
    return { useCase, tipoTicketRepo };
  }

  it('activo:false da de baja (soft delete) el tipo y persiste', async () => {
    const tipo = TipoTicketEntity.create(
      { codigo: 'RRHH', nombre: 'RRHH', modulo: 'TICKETS', activo: true },
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
      { codigo: 'RRHH', nombre: 'RRHH', modulo: 'TICKETS', activo: true },
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

  // Decisión del dueño 2026-10-15 (odd/tasks/deuda-tecnica-2026-10-15.md, CA1):
  // los tipos fijos no se desactivan, ni siquiera ROOT. El guard no entra acá.
  it.each(TIPOS_TICKET_DEL_SISTEMA)(
    'activo:false sobre el tipo fijo %s → TipoTicketDelSistemaError, sin persistir',
    async (codigo) => {
      const tipo = TipoTicketEntity.create(
        { codigo, nombre: codigo, modulo: 'TICKETS', activo: true },
        'id-1',
      );
      const c = makeCollaborators(tipo);

      const result = await c.useCase.execute({ id: 'id-1', activo: false });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TipoTicketDelSistemaError);
      expect(tipo.activo).toBe(true);
      expect(c.tipoTicketRepo.save).not.toHaveBeenCalled();
    },
  );

  it('activo:true reactiva un tipo fijo que ya estaba dado de baja (recuperación)', async () => {
    const tipo = TipoTicketEntity.create(
      { codigo: 'PREVENTIVO', nombre: 'Preventivo', modulo: 'EDILICIA', activo: true },
      'id-1',
    );
    tipo.desactivar();
    const c = makeCollaborators(tipo);

    const result = await c.useCase.execute({ id: 'id-1', activo: true });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().activo).toBe(true);
    expect(c.tipoTicketRepo.save).toHaveBeenCalledWith(tipo);
  });
});
