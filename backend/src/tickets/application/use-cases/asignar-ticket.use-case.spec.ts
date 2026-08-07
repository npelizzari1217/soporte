/**
 * T8.1/T8.2 [UNIT] — RED→GREEN: `AsignarTicketUseCase`.
 *
 * Todos los puertos mockeados (`vi.fn`) — sin DB. Cubre T14 (asignación
 * manual válida: asignado activo+en tenant, elegible por
 * `usuario_tipos_ticket`, operación ASIGNACION en la misma tx) y T15
 * (elegibilidad ortogonal al permiso — un asignador con `ticket:asignar`
 * pero un asignado NO elegible sigue fallando 422).
 *
 * Ref spec: sdd/tickets-core/spec T14, T15. Tarea: T8.1, T8.2.
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
    };
    const usuarioTiposTicketRepo = {
      isUserEligibleForType: vi.fn().mockResolvedValue(true),
      assign: vi.fn(),
      revoke: vi.fn(),
    };
    const tipoOperacionRepo = {
      findIdByCodigo: vi.fn().mockResolvedValue('tipo-op-asignacion-uuid'),
    };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new AsignarTicketUseCase(
      ticketRepo as never,
      operacionRepo as never,
      usuarioMasterChecker as never,
      usuarioTiposTicketRepo as never,
      tipoOperacionRepo as never,
      txRunner as never,
    );

    return {
      useCase,
      ticketRepo,
      operacionRepo,
      usuarioMasterChecker,
      usuarioTiposTicketRepo,
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
    expect(c.usuarioTiposTicketRepo.isUserEligibleForType).not.toHaveBeenCalled();
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('T14/T15: asignado sin fila en usuario_tipos_ticket para el tipo del ticket → AsignadoNoElegibleError (422), sin tx', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket());
    c.usuarioTiposTicketRepo.isUserEligibleForType.mockResolvedValue(false);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(AsignadoNoElegibleError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
    expect(c.ticketRepo.save).not.toHaveBeenCalled();
  });

  it('T15: elegibilidad es ortogonal al permiso — la validación de negocio no depende de qué permiso tenga el asignador (fuera del alcance del use case)', async () => {
    // El use case no recibe ni evalúa permisos (eso lo resuelve PermissionsGuard
    // en la capa de interface, T10-style). Este test documenta que, aun con
    // datos de "asignador con permiso" implícitos en el DTO (autorId), el
    // rechazo por elegibilidad ocurre igual — la elegibilidad no se salta.
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket());
    c.usuarioTiposTicketRepo.isUserEligibleForType.mockResolvedValue(false);

    const result = await c.useCase.execute(baseDto({ autorId: 'tecnico-con-permiso-uuid' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(AsignadoNoElegibleError);
  });

  it('elegibilidad se verifica contra el tipoId ACTUAL del ticket', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket());

    await c.useCase.execute(baseDto());

    expect(c.usuarioTiposTicketRepo.isUserEligibleForType).toHaveBeenCalledWith(
      'agente-uuid',
      'tipo-soporte-uuid',
    );
  });
});
