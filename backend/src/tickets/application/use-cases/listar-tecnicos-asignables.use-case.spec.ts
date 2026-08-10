/**
 * [UNIT] — `ListarTecnicosAsignablesUseCase`.
 *
 * Puertos mockeados (`vi.fn`) — sin DB. Cubre el camino feliz (técnicos de un
 * tipo con módulo) y el tipo custom SIN módulo → `[]` (no hay técnicos
 * elegibles por catálogo). También el 404 de ticket inexistente.
 */
import { ListarTecnicosAsignablesUseCase } from './listar-tecnicos-asignables.use-case';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';

function makeTicket(tipoId = 'tipo-soporte-uuid'): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Ticket de prueba',
      descripcion: null,
      tipoId,
      estadoId: 'estado-nuevo-uuid',
      prioridadId: 'prioridad-media-uuid',
      cicloId: 'ciclo-uuid',
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
    },
    'ticket-uuid',
  );
}

describe('ListarTecnicosAsignablesUseCase', () => {
  function makeCollaborators(tipoCodigo = 'SOPORTE') {
    const ticketRepo = { findById: vi.fn() };
    const tipoTicketRepo = { findById: vi.fn().mockResolvedValue({ codigo: tipoCodigo }) };
    const usuarioMasterChecker = { listarTecnicosAsignables: vi.fn().mockResolvedValue([]) };

    const useCase = new ListarTecnicosAsignablesUseCase(
      ticketRepo as never,
      tipoTicketRepo as never,
      usuarioMasterChecker as never,
    );
    return { useCase, ticketRepo, tipoTicketRepo, usuarioMasterChecker };
  }

  it('happy: tipo con módulo → resuelve el módulo y devuelve los técnicos del checker', async () => {
    const c = makeCollaborators('SOPORTE');
    c.ticketRepo.findById.mockResolvedValue(makeTicket());
    const tecnicos = [
      { id: 'tec-1', nombre: 'Ana', apellido: 'García' },
      { id: 'tec-2', nombre: 'Beto', apellido: 'López' },
    ];
    c.usuarioMasterChecker.listarTecnicosAsignables.mockResolvedValue(tecnicos);

    const result = await c.useCase.execute({ ticketId: 'ticket-uuid', clienteId: 'cliente-uuid' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual(tecnicos);
    // El módulo del tipo SOPORTE es 'SOPORTE'.
    expect(c.usuarioMasterChecker.listarTecnicosAsignables).toHaveBeenCalledWith(
      'cliente-uuid',
      'SOPORTE',
    );
  });

  it('tipo custom SIN módulo → pasa modulo=null al checker (que devuelve [])', async () => {
    const c = makeCollaborators('CUSTOM_TENANT');
    c.ticketRepo.findById.mockResolvedValue(makeTicket('tipo-custom-uuid'));

    const result = await c.useCase.execute({ ticketId: 'ticket-uuid', clienteId: 'cliente-uuid' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([]);
    expect(c.usuarioMasterChecker.listarTecnicosAsignables).toHaveBeenCalledWith(
      'cliente-uuid',
      null,
    );
  });

  it('ticket inexistente → TicketNoEncontradoError, sin resolver tipo ni técnicos', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute({ ticketId: 'ticket-uuid', clienteId: 'cliente-uuid' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(c.tipoTicketRepo.findById).not.toHaveBeenCalled();
    expect(c.usuarioMasterChecker.listarTecnicosAsignables).not.toHaveBeenCalled();
  });
});
