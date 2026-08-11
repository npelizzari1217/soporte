/**
 * [UNIT] — `ListarTecnicosAsignablesUseCase`.
 *
 * Puertos mockeados (`vi.fn`) — sin DB. Cubre el camino feliz (técnicos del
 * módulo del tipo, leído de la columna `modulo`, B2) y la REGRESIÓN del gap:
 * un tipo CUSTOM ahora tiene un módulo real → devuelve técnicos (antes, al
 * derivar el módulo por convención de `codigo`, un custom caía en `null` y la
 * lista era `[]`). También el 404 de ticket inexistente.
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
  function makeCollaborators(modulo = 'SOPORTE') {
    const ticketRepo = { findById: vi.fn() };
    const tipoTicketRepo = { findById: vi.fn().mockResolvedValue({ codigo: 'ANY', modulo }) };
    const usuarioMasterChecker = { listarTecnicosAsignables: vi.fn().mockResolvedValue([]) };

    const useCase = new ListarTecnicosAsignablesUseCase(
      ticketRepo as never,
      tipoTicketRepo as never,
      usuarioMasterChecker as never,
    );
    return { useCase, ticketRepo, tipoTicketRepo, usuarioMasterChecker };
  }

  it('happy: lee el módulo del tipo (columna) y devuelve los técnicos del checker', async () => {
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
    expect(c.usuarioMasterChecker.listarTecnicosAsignables).toHaveBeenCalledWith(
      'cliente-uuid',
      'SOPORTE',
    );
  });

  it('REGRESIÓN gap B2: tipo CUSTOM con módulo real → devuelve técnicos (antes daba [])', async () => {
    // Un tipo custom (COMPRAS_GENERALES) tiene módulo COMPRAS en la columna;
    // antes se derivaba por `codigo` → null → lista vacía. Ahora hay técnicos.
    const c = makeCollaborators('COMPRAS');
    c.ticketRepo.findById.mockResolvedValue(makeTicket('tipo-custom-uuid'));
    const tecnicos = [{ id: 'tec-3', nombre: 'Caro', apellido: 'Díaz' }];
    c.usuarioMasterChecker.listarTecnicosAsignables.mockResolvedValue(tecnicos);

    const result = await c.useCase.execute({ ticketId: 'ticket-uuid', clienteId: 'cliente-uuid' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual(tecnicos);
    expect(c.usuarioMasterChecker.listarTecnicosAsignables).toHaveBeenCalledWith(
      'cliente-uuid',
      'COMPRAS',
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
