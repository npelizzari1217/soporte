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
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { TicketAsignadoEvent } from '../../domain/events/ticket-asignado.event';
import {
  TicketNoEncontradoError,
  AsignadoInvalidoError,
  AsignadoNoElegibleError,
  TicketCerradoNoReasignableError,
} from '../../domain/errors/tickets.errors';

/** Catálogo fijo de estados del tenant: código → id. */
const ESTADO_IDS: Record<string, string> = {
  NUEVO: 'estado-nuevo-uuid',
  ASIGNADO: 'estado-asignado-uuid',
  EN_PROCESO: 'estado-enproceso-uuid',
  ESPERANDO_CLIENTE: 'estado-espera-uuid',
  RESUELTO: 'estado-resuelto-uuid',
  CERRADO: 'estado-cerrado-uuid',
  CANCELADO: 'estado-cancelado-uuid',
};

function makeTicket(
  overrides: Partial<{ asignadoId: string | null; estado: keyof typeof ESTADO_IDS }> = {},
): TicketEntity {
  const ticket = TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Ticket de prueba',
      descripcion: null,
      tipoId: 'tipo-soporte-uuid',
      estadoId: ESTADO_IDS[overrides.estado ?? 'NUEVO'],
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
      findIdByCodigo: vi.fn(async (codigo: string) =>
        codigo === 'CAMBIO_ESTADO' ? 'tipo-op-cambio-uuid' : 'tipo-op-asignacion-uuid',
      ),
    };
    // `alCommitear` encola: el test decide cuándo "comitea" corriendo la cola.
    const alCommitear: Array<() => void> = [];
    const txRunner = {
      run: vi.fn((fn: () => Promise<unknown>) => fn()),
      alCommitear: vi.fn((fn: () => void) => {
        alCommitear.push(fn);
      }),
    };
    const estadoRepo = {
      findById: vi.fn(async (id: string) => {
        const codigo = Object.keys(ESTADO_IDS).find((c) => ESTADO_IDS[c] === id);
        return codigo
          ? EstadoEntity.create({ codigo, nombre: codigo, color: null, orden: 1, activo: true }, id)
          : null;
      }),
      findIdByCodigo: vi.fn(async (codigo: string) => ESTADO_IDS[codigo] ?? null),
    } satisfies Pick<IEstadoRepository, 'findById' | 'findIdByCodigo'>;
    const eventPublisher = { publish: vi.fn() } satisfies IDomainEventPublisher;

    const useCase = new AsignarTicketUseCase(
      ticketRepo as never,
      operacionRepo as never,
      usuarioMasterChecker as never,
      tipoTicketRepo as never,
      tipoOperacionRepo as never,
      txRunner as never,
      estadoRepo,
      eventPublisher,
    );

    return {
      useCase,
      ticketRepo,
      operacionRepo,
      usuarioMasterChecker,
      tipoTicketRepo,
      tipoOperacionRepo,
      txRunner,
      estadoRepo,
      eventPublisher,
      alCommitear,
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
    expect(c.operacionRepo.save).toHaveBeenCalledTimes(2);
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

  it.each(['CERRADO', 'CANCELADO'])(
    'M1: ticket %s → TicketCerradoNoReasignableError, sin consultar master ni escribir ni publicar',
    async (estado) => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket({ estado }));

      const result = await c.useCase.execute(baseDto());

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TicketCerradoNoReasignableError);
      expect(c.usuarioMasterChecker.estaActivoEnTenant).not.toHaveBeenCalled();
      expect(c.txRunner.run).not.toHaveBeenCalled();
      expect(c.txRunner.alCommitear).not.toHaveBeenCalled();
      expect(c.operacionRepo.save).not.toHaveBeenCalled();
      expect(c.ticketRepo.save).not.toHaveBeenCalled();
    },
  );

  it.each(['ASIGNADO', 'EN_PROCESO', 'ESPERANDO_CLIENTE', 'RESUELTO'])(
    'M2: ticket %s se reasigna sin cambiar de estado (solo ASIGNACION)',
    async (estado) => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket({ estado, asignadoId: 'otro-uuid' }));

      const result = await c.useCase.execute(baseDto());

      expect(result.isOk()).toBe(true);
      expect(result.getValue().estadoId).toBe(ESTADO_IDS[estado]);
      expect(result.getValue().asignadoId).toBe('agente-uuid');
      expect(c.operacionRepo.save).toHaveBeenCalledTimes(1);
      expect(c.operacionRepo.save.mock.calls[0][0].tipoOperacionId).toBe('tipo-op-asignacion-uuid');
    },
  );

  it('M3: NUEVO → ASIGNADO en la misma tx, con CAMBIO_ESTADO del actor además de ASIGNACION', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket({ estado: 'NUEVO' }));

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    expect(result.getValue().estadoId).toBe(ESTADO_IDS.ASIGNADO);
    const ops = c.operacionRepo.save.mock.calls.map((call) => call[0]);
    const asignacion = ops.find((o) => o.tipoOperacionId === 'tipo-op-asignacion-uuid');
    const cambio = ops.find((o) => o.tipoOperacionId === 'tipo-op-cambio-uuid');
    expect(asignacion?.estadoNuevoId).toBeNull();
    expect(cambio?.estadoAnteriorId).toBe(ESTADO_IDS.NUEVO);
    expect(cambio?.estadoNuevoId).toBe(ESTADO_IDS.ASIGNADO);
    expect(cambio?.autorId).toBe('asignador-uuid');
    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.ticketRepo.save).toHaveBeenCalledTimes(1);
  });

  it('N1: ticket.asignado MANUAL con autorId del actor, solo al correr la cola de alCommitear', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket());

    await c.useCase.execute(baseDto());

    expect(c.eventPublisher.publish).not.toHaveBeenCalled();
    c.alCommitear.forEach((fn) => fn());
    expect(c.eventPublisher.publish).toHaveBeenCalledTimes(1);
    const evento = c.eventPublisher.publish.mock.calls[0][0] as TicketAsignadoEvent;
    expect(evento).toBeInstanceOf(TicketAsignadoEvent);
    expect(evento).toMatchObject({
      ticketId: 'ticket-uuid',
      asignadoId: 'agente-uuid',
      origen: 'MANUAL',
      autorId: 'asignador-uuid',
    });
  });

  it('destinatario no elegible en un NUEVO conserva su error y no publica', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket());
    c.usuarioMasterChecker.getAutorizacionModulos.mockResolvedValue({
      esAdminTotal: false,
      modulos: ['COMPRAS'],
    });

    const result = await c.useCase.execute(baseDto());

    expect(result.getError()).toBeInstanceOf(AsignadoNoElegibleError);
    expect(c.txRunner.alCommitear).not.toHaveBeenCalled();
  });

  it('autoasignación (asignado = actor) sigue permitida', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket());

    const result = await c.useCase.execute(
      baseDto({ asignadoId: 'asignador-uuid', autorId: 'asignador-uuid' }),
    );

    expect(result.isOk()).toBe(true);
    expect(result.getValue().asignadoId).toBe('asignador-uuid');
  });
});
