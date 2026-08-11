/**
 * [UNIT] — `AsignarTicketUseCase`.
 *
 * Todos los puertos mockeados (`vi.fn`) — sin DB. Cubre asignación manual
 * válida (asignado activo+en tenant, ELEGIBLE POR MÓDULO/CATÁLOGO, operación
 * ASIGNACION en la misma tx) y la regla de elegibilidad por módulo: ROOT/
 * ADMINISTRADOR pueden todo; un usuario normal solo si tiene el módulo que
 * mapea al tipo del ticket; sin él → 422 (ortogonal al permiso del asignador).
 */
import { AsignarTicketUseCase, AsignarTicketDto } from './asignar-ticket.use-case';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import {
  TicketNoEncontradoError,
  AsignadoInvalidoError,
  AsignadoNoElegibleError,
} from '../../domain/errors/tickets.errors';

function makeTicket(overrides: Partial<{ asignadoId: string | null }> = {}): TicketEntity {
  const ticket = TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Ticket de prueba',
      descripcion: null,
      tipoId: 'tipo-soporte-uuid',
      estadoId: 'estado-nuevo-uuid',
      prioridadId: 'prioridad-media-uuid',
      cicloId: 'ciclo-uuid',
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
    },
    'ticket-uuid',
  );
  if (overrides.asignadoId !== undefined) {
    ticket.assignTo(overrides.asignadoId);
  }
  return ticket;
}

function baseDto(overrides: Partial<AsignarTicketDto> = {}): AsignarTicketDto {
  return {
    ticketId: 'ticket-uuid',
    asignadoId: 'agente-uuid',
    clienteId: 'cliente-uuid',
    autorId: 'asignador-uuid',
    ...overrides,
  };
}

describe('AsignarTicketUseCase', () => {
  function makeCollaborators() {
    const ticketRepo = {
      findById: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const operacionRepo = { save: vi.fn().mockResolvedValue(undefined) };
    const usuarioMasterChecker = {
      existeEnTenant: vi.fn(),
      estaActivoEnTenant: vi.fn().mockResolvedValue(true),
      // Por defecto: usuario normal CON el módulo SOPORTE (elegible para el
      // ticket de tipo SOPORTE que arma makeTicket).
      getAutorizacionModulos: vi
        .fn()
        .mockResolvedValue({ esAdminTotal: false, modulos: ['SOPORTE'] }),
    };
    // El tipo del ticket (tipo-soporte-uuid) pertenece al módulo SOPORTE (B2:
    // la elegibilidad lee la columna `modulo` vía findById, no deriva por codigo).
    const tipoTicketRepo = {
      findById: vi.fn().mockResolvedValue({ codigo: 'SOPORTE', modulo: 'SOPORTE' }),
    };
    const tipoOperacionRepo = {
      findIdByCodigo: vi.fn().mockResolvedValue('tipo-op-asignacion-uuid'),
    };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new AsignarTicketUseCase(
      ticketRepo as never,
      operacionRepo as never,
      usuarioMasterChecker as never,
      tipoTicketRepo as never,
      tipoOperacionRepo as never,
      txRunner as never,
    );

    return {
      useCase,
      ticketRepo,
      operacionRepo,
      usuarioMasterChecker,
      tipoTicketRepo,
      tipoOperacionRepo,
      txRunner,
    };
  }

  it('T14: asignación válida — setea asignado_id y registra operación ASIGNACION en la misma tx', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket());

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    const ticket = result.getValue();
    expect(ticket.asignadoId).toBe('agente-uuid');

    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.ticketRepo.save).toHaveBeenCalledWith(ticket);
    expect(c.operacionRepo.save).toHaveBeenCalledTimes(1);
    const operacionGuardada = c.operacionRepo.save.mock.calls[0][0];
    expect(operacionGuardada.ticketId).toBe('ticket-uuid');
    expect(operacionGuardada.tipoOperacionId).toBe('tipo-op-asignacion-uuid');
    expect(operacionGuardada.autorId).toBe('asignador-uuid');
    expect(operacionGuardada.estadoAnteriorId).toBeNull();
    expect(operacionGuardada.estadoNuevoId).toBeNull();
  });

  it('T14: reasignación — cambia el asignado_id existente por uno nuevo', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket({ asignadoId: 'agente-anterior-uuid' }));

    const result = await c.useCase.execute(baseDto({ asignadoId: 'agente-nuevo-uuid' }));

    expect(result.isOk()).toBe(true);
    expect(result.getValue().asignadoId).toBe('agente-nuevo-uuid');
  });

  it('ticket inexistente → TicketNoEncontradoError (404), sin tocar checkers/tx', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(c.usuarioMasterChecker.estaActivoEnTenant).not.toHaveBeenCalled();
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('ticket soft-deleted → TicketNoEncontradoError (404)', async () => {
    const c = makeCollaborators();
    const ticket = makeTicket();
    ticket.softDelete();
    c.ticketRepo.findById.mockResolvedValue(ticket);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
  });

  it('T14: asignado inexistente/inactivo/fuera del tenant → AsignadoInvalidoError (422), sin tocar elegibilidad/tx', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket());
    c.usuarioMasterChecker.estaActivoEnTenant.mockResolvedValue(false);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(AsignadoInvalidoError);
    expect(c.usuarioMasterChecker.getAutorizacionModulos).not.toHaveBeenCalled();
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('asignado normal SIN el módulo del tipo del ticket → AsignadoNoElegibleError (422), sin tx', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket());
    // Tiene COMPRAS, pero el ticket es de tipo SOPORTE → no elegible.
    c.usuarioMasterChecker.getAutorizacionModulos.mockResolvedValue({
      esAdminTotal: false,
      modulos: ['COMPRAS'],
    });

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(AsignadoNoElegibleError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
    expect(c.ticketRepo.save).not.toHaveBeenCalled();
  });

  it('asignado normal sin ningún módulo → AsignadoNoElegibleError (422)', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket());
    c.usuarioMasterChecker.getAutorizacionModulos.mockResolvedValue({
      esAdminTotal: false,
      modulos: [],
    });

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(AsignadoNoElegibleError);
  });

  it('CORE: un técnico CON el módulo del catálogo puede ser asignado/tomar el ticket', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket());
    c.usuarioMasterChecker.getAutorizacionModulos.mockResolvedValue({
      esAdminTotal: false,
      modulos: ['SOPORTE'],
    });

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    expect(result.getValue().asignadoId).toBe('agente-uuid');
    // La elegibilidad se resuelve para el asignado en el cliente del ticket.
    expect(c.usuarioMasterChecker.getAutorizacionModulos).toHaveBeenCalledWith(
      'agente-uuid',
      'cliente-uuid',
    );
  });

  it('ROOT/ADMINISTRADOR (esAdminTotal) es elegible aunque no tenga módulos cargados', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket());
    c.usuarioMasterChecker.getAutorizacionModulos.mockResolvedValue({
      esAdminTotal: true,
      modulos: [],
    });

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    // No necesita cargar el tipo por módulo cuando ve todo (short-circuit esAdminTotal).
    expect(c.tipoTicketRepo.findById).not.toHaveBeenCalled();
  });
});
