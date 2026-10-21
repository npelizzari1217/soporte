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
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { unstubbed } from '../../../testing/mocks';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { TicketAsignadoEvent } from '../../domain/events/ticket-asignado.event';
import { alcancePorTipo, alcanceSinRestriccion } from '../../test-helpers/alcance-ticket';
import {
  AccionSobreTipoNoPermitidaError,
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
  overrides: Partial<{
    asignadoId: string | null;
    estado: keyof typeof ESTADO_IDS;
    tipoId: string;
  }> = {},
): TicketEntity {
  const ticket = TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Ticket de prueba',
      descripcion: null,
      tipoId: overrides.tipoId ?? 'tipo-soporte-uuid',
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
    // Ve cualquier ticket: los casos de asignación no dependen del acceso.
    ...alcanceSinRestriccion('asignador-uuid'),
    ...overrides,
  };
}

describe('AsignarTicketUseCase', () => {
  function makeCollaborators() {
    const ticketRepo = {
      findById: vi.fn<ITicketRepository['findById']>(),
      save: vi.fn<ITicketRepository['save']>().mockResolvedValue(undefined),
      findByIds: unstubbed('findByIds'),
      findByNumero: unstubbed('findByNumero'),
      findLastSecuencia: unstubbed('findLastSecuencia'),
      findAll: unstubbed('findAll'),
      count: unstubbed('count'),
      esVisiblePara: vi.fn<ITicketRepository['esVisiblePara']>().mockResolvedValue(false),
      bloquear: vi.fn<ITicketRepository['bloquear']>().mockResolvedValue(undefined),
      delete: unstubbed('delete'),
    };
    const operacionRepo = {
      save: vi.fn<IOperacionTicketRepository['save']>().mockResolvedValue(undefined),
      listByTicket: unstubbed('listByTicket'),
      findById: unstubbed('findById'),
    };
    const usuarioMasterChecker = {
      existeEnTenant: vi.fn<IUsuarioMasterChecker['existeEnTenant']>(),
      estaActivoEnTenant: vi
        .fn<IUsuarioMasterChecker['estaActivoEnTenant']>()
        .mockResolvedValue(true),
      // Por defecto: usuario normal CON el módulo TICKETS (elegible para el
      // ticket de tipo SOPORTE que arma makeTicket).
      getAutorizacionModulos: vi
        .fn<IUsuarioMasterChecker['getAutorizacionModulos']>()
        .mockResolvedValue({ esAdminTotal: false, modulos: ['TICKETS'] }),
    };
    // El tipo del ticket (tipo-soporte-uuid) pertenece al módulo TICKETS (B2:
    // la elegibilidad lee la columna `modulo` vía findById, no deriva por codigo).
    const tipoTicketRepo = {
      findById: vi
        .fn<ITipoTicketRepository['findById']>()
        .mockResolvedValue(
          TipoTicketEntity.create(
            { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'TICKETS', activo: true },
            'tipo-soporte-uuid',
          ),
        ),
    };
    const tipoOperacionRepo = {
      findIdByCodigo: vi.fn<ITipoOperacionRepository['findIdByCodigo']>(async (codigo) =>
        codigo === 'CAMBIO_ESTADO' ? 'tipo-op-cambio-uuid' : 'tipo-op-asignacion-uuid',
      ),
      findByCodigo: unstubbed('findByCodigo'),
      findAllActive: unstubbed('findAllActive'),
    };
    // `alCommitear` encola: el test decide cuándo "comitea" corriendo la cola.
    const alCommitear: Array<() => void> = [];
    const txRunner: ITenantTransactionRunner = {
      run: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
      alCommitear: (fn: () => void) => {
        alCommitear.push(fn);
      },
    };
    vi.spyOn(txRunner, 'run');
    vi.spyOn(txRunner, 'alCommitear');
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
      ticketRepo,
      operacionRepo,
      usuarioMasterChecker,
      tipoTicketRepo,
      tipoOperacionRepo,
      txRunner,
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

  // odd/escrituras-manuales-con-lock (S3): la primera carga sirve para el 404 y master; dentro
  // de la tx se bloquea la fila y se RELEE antes de escribir, así la decisión mira el estado vigente.
  it('dentro de la transacción bloquea la fila y relee el ticket antes de escribir', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket());

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    expect(c.ticketRepo.findById).toHaveBeenCalledTimes(2);
    expect(c.ticketRepo.bloquear).toHaveBeenCalledWith('ticket-uuid');
    const [ordenRun] = vi.mocked(c.txRunner.run).mock.invocationCallOrder;
    const [ordenLock] = c.ticketRepo.bloquear.mock.invocationCallOrder;
    const [, ordenRelectura] = c.ticketRepo.findById.mock.invocationCallOrder;
    const [ordenSave] = c.ticketRepo.save.mock.invocationCallOrder;
    expect(ordenRun).toBeLessThan(ordenLock);
    expect(ordenLock).toBeLessThan(ordenRelectura);
    expect(ordenRelectura).toBeLessThan(ordenSave);
  });

  it('si al releer con la fila bloqueada el ticket ya está CERRADO, rechaza sin escribir', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById
      .mockResolvedValueOnce(makeTicket())
      .mockResolvedValueOnce(makeTicket({ estado: 'CERRADO' }));

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketCerradoNoReasignableError);
    expect(c.ticketRepo.save).not.toHaveBeenCalled();
    expect(c.operacionRepo.save).not.toHaveBeenCalled();
    expect(c.txRunner.alCommitear).not.toHaveBeenCalled();
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
    // Tiene COMPRAS, pero el tipo SOPORTE del ticket es del módulo TICKETS → no elegible.
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
      modulos: ['TICKETS'],
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

  describe('permisos por tipo (odd/permisos-por-tipo-ticket, S2, S3, S6)', () => {
    // Mismo usuario: Soporte con Ver y Asignar, Mantenimiento solo con Ver, Electricidad sin nada.
    const alcance = alcancePorTipo('solicitante-uuid', {
      'tipo-soporte-uuid': ['LECTURA', 'ASIGNAR'],
      'tipo-mantenimiento-uuid': ['LECTURA'],
    });

    it('asigna un ticket de un tipo con ASIGNAR', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket());

      const result = await c.useCase.execute(baseDto(alcance));

      expect(result.getValue().asignadoId).toBe('agente-uuid');
      expect(c.ticketRepo.save).toHaveBeenCalledTimes(1);
    });

    it('un ticket de un tipo con solo LECTURA es 403; no se asigna ni se escribe nada', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket({ tipoId: 'tipo-mantenimiento-uuid' }));

      const result = await c.useCase.execute(baseDto(alcance));

      expect(result.getError()).toBeInstanceOf(AccionSobreTipoNoPermitidaError);
      expect(result.getError().message).toContain('"ASIGNAR"');
      expect(c.txRunner.run).not.toHaveBeenCalled();
      expect(c.ticketRepo.save).not.toHaveBeenCalled();
      expect(c.operacionRepo.save).not.toHaveBeenCalled();
      expect(c.alCommitear).toHaveLength(0);
    });

    it('un ticket de un tipo sin LECTURA es 404, sin consultar master ni escribir', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket({ tipoId: 'tipo-electricidad-uuid' }));

      const result = await c.useCase.execute(baseDto(alcance));

      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(c.usuarioMasterChecker.estaActivoEnTenant).not.toHaveBeenCalled();
      expect(c.txRunner.run).not.toHaveBeenCalled();
      expect(c.ticketRepo.save).not.toHaveBeenCalled();
    });

    it('un ticket que el actor no ve por fila (sin VER_TODOS, ni solicitante, ni responsable, ni tarea) es 404', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket());

      const result = await c.useCase.execute(
        baseDto(alcancePorTipo('asignador-uuid', { 'tipo-soporte-uuid': ['LECTURA', 'ASIGNAR'] })),
      );

      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(c.ticketRepo.esVisiblePara).toHaveBeenCalledWith('ticket-uuid', 'asignador-uuid');
      expect(c.txRunner.run).not.toHaveBeenCalled();
      expect(c.ticketRepo.save).not.toHaveBeenCalled();
    });

    it('sin restricción (ROOT o ADMINISTRADOR) pasa el acceso en un tipo sin filas', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket({ tipoId: 'tipo-electricidad-uuid' }));
      // El asignado es ROOT/ADMINISTRADOR: elegible para un tipo de cualquier módulo.
      c.usuarioMasterChecker.getAutorizacionModulos.mockResolvedValue({
        esAdminTotal: true,
        modulos: [],
      });

      const result = await c.useCase.execute(baseDto(alcanceSinRestriccion('asignador-uuid')));

      expect(result.isOk()).toBe(true);
      expect(c.ticketRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});
