/**
 * [UNIT] — `AsignarYPonerEnProcesoUseCase`.
 *
 * Puertos mockeados (`vi.fn`), pero se usa la máquina de estados REAL
 * (`BaseTicketStateMachine`) para validar los arcos igual que en producción.
 * Cubre: happy desde NUEVO (asigna + 2 saltos hasta EN_PROCESO con ops de
 * timeline), happy desde ASIGNADO (1 salto), asignado no elegible → falla sin
 * tx, y estado terminal (RESUELTO) → TransicionInvalida sin tx. La elegibilidad
 * es la real (`ElegibilidadAsignado`, `LECTURA` sobre el tipo) sobre dobles en memoria.
 */
import {
  AsignarYPonerEnProcesoUseCase,
  AsignarYPonerEnProcesoDto,
} from './asignar-y-poner-en-proceso.use-case';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { TicketAsignadoEvent } from '../../domain/events/ticket-asignado.event';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import { TicketStateMachineFactory } from '../../domain/state-machine/ticket-state-machine.factory';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { unstubbed } from '../../../testing/mocks';
import { BaseTicketStateMachine } from '../../domain/state-machine/base-ticket-state-machine';
import { alcancePorTipo, alcanceSinRestriccion } from '../../test-helpers/alcance-ticket';
import { MasterAgentesEnMemoria } from '../../test-helpers/master-agentes-en-memoria';
import { PermisosTipoTicketEnMemoria } from '../../test-helpers/permisos-tipo-ticket-en-memoria';
import { ElegibilidadAsignado } from '../services/elegibilidad-asignado';
import {
  AccionSobreTipoNoPermitidaError,
  AsignadoInvalidoError,
  AsignadoNoElegibleError,
  TicketNoEncontradoError,
  TransicionInvalidaError,
  TicketCerradoNoReasignableError,
} from '../../domain/errors/tickets.errors';

/** Estado del catálogo como entidad real, con el id fijo de `ESTADOS`. */
function makeEstado(codigo: string): EstadoEntity {
  return EstadoEntity.create(
    { codigo, nombre: codigo, color: null, orden: 1, activo: true },
    ESTADOS[codigo].id,
  );
}

/** Catálogo fijo de estados code → { id, codigo } para los mocks del repo. */
const ESTADOS: Record<string, { id: string; codigo: string }> = {
  NUEVO: { id: 'estado-nuevo-uuid', codigo: 'NUEVO' },
  ASIGNADO: { id: 'estado-asignado-uuid', codigo: 'ASIGNADO' },
  EN_PROCESO: { id: 'estado-enproceso-uuid', codigo: 'EN_PROCESO' },
  RESUELTO: { id: 'estado-resuelto-uuid', codigo: 'RESUELTO' },
  CERRADO: { id: 'estado-cerrado-uuid', codigo: 'CERRADO' },
  CANCELADO: { id: 'estado-cancelado-uuid', codigo: 'CANCELADO' },
};

function makeTicket(
  estadoCodigo: keyof typeof ESTADOS,
  tipoId = 'tipo-soporte-uuid',
): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Ticket de prueba',
      descripcion: null,
      tipoId,
      estadoId: ESTADOS[estadoCodigo].id,
      prioridadId: 'prioridad-media-uuid',
      cicloId: 'ciclo-uuid',
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
    },
    'ticket-uuid',
  );
}

function baseDto(overrides: Partial<AsignarYPonerEnProcesoDto> = {}): AsignarYPonerEnProcesoDto {
  return {
    ticketId: 'ticket-uuid',
    asignadoId: 'agente-uuid',
    autorId: 'asignador-uuid',
    clienteId: 'cliente-uuid',
    // Ve cualquier ticket: los casos del flujo combinado no dependen del acceso.
    ...alcanceSinRestriccion('asignador-uuid'),
    ...overrides,
  };
}

describe('AsignarYPonerEnProcesoUseCase', () => {
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
      borrarSiActivo: unstubbed('borrarSiActivo'),
      recuperarSiBorrado: unstubbed('recuperarSiBorrado'),
    };
    const operacionRepo = {
      save: vi.fn<IOperacionTicketRepository['save']>().mockResolvedValue(undefined),
      listByTicket: unstubbed('listByTicket'),
      findById: unstubbed('findById'),
    };
    const estadoRepo = {
      findById: vi.fn<IEstadoRepository['findById']>(async (id) => {
        const estado = Object.values(ESTADOS).find((e) => e.id === id);
        return estado ? makeEstado(estado.codigo) : null;
      }),
      findByCodigo: vi.fn<IEstadoRepository['findByCodigo']>(async (codigo) =>
        ESTADOS[codigo] ? makeEstado(codigo) : null,
      ),
      findIdByCodigo: unstubbed('findIdByCodigo'),
      findAllActive: unstubbed('findAllActive'),
    };
    const tipoTicketRepo = {
      findById: vi
        .fn<ITipoTicketRepository['findById']>()
        .mockResolvedValue(
          TipoTicketEntity.create(
            { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'TICKETS', activo: true },
            'tipo-soporte-uuid',
          ),
        ),
      findIdByCodigo: vi.fn<ITipoTicketRepository['findIdByCodigo']>(async (codigo) =>
        codigo === 'SOPORTE' ? 'tipo-soporte-uuid' : null,
      ),
      findByCodigo: unstubbed('findByCodigo'),
      findAllActive: unstubbed('findAllActive'),
      findAllActiveByModulo: unstubbed('findAllActiveByModulo'),
      findIdsByModulos: unstubbed('findIdsByModulos'),
      save: unstubbed('save'),
    };
    const tipoOperacionRepo = {
      findIdByCodigo: vi.fn<ITipoOperacionRepository['findIdByCodigo']>(async (codigo) =>
        codigo === 'ASIGNACION' ? 'tipo-op-asignacion-uuid' : 'tipo-op-cambio-uuid',
      ),
      findByCodigo: unstubbed('findByCodigo'),
      findAllActive: unstubbed('findAllActive'),
    };
    const usuarioMasterChecker = {
      estaActivoEnTenant: vi
        .fn<IUsuarioMasterChecker['estaActivoEnTenant']>()
        .mockResolvedValue(true),
    };
    // Por defecto: un TECNICO con LECTURA sobre el tipo SOPORTE del ticket.
    const masterAgentes = new MasterAgentesEnMemoria();
    masterAgentes.agregar({ id: 'agente-uuid', rol: 'TECNICO', celdas: [] });
    const permisosTipo = new PermisosTipoTicketEnMemoria(
      [],
      [{ usuarioId: 'agente-uuid', tipoId: 'tipo-soporte-uuid', accion: 'LECTURA' }],
    );
    const elegibilidad = new ElegibilidadAsignado(masterAgentes, permisosTipo);
    const stateMachineFactory = {
      resolve: vi.fn<TicketStateMachineFactory['resolve']>(() => new BaseTicketStateMachine()),
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
    const eventPublisher = { publish: vi.fn() } satisfies IDomainEventPublisher;

    const useCase = new AsignarYPonerEnProcesoUseCase(
      ticketRepo,
      operacionRepo,
      estadoRepo,
      tipoTicketRepo,
      tipoOperacionRepo,
      usuarioMasterChecker,
      elegibilidad,
      stateMachineFactory,
      txRunner,
      eventPublisher,
    );

    return {
      useCase,
      ticketRepo,
      operacionRepo,
      estadoRepo,
      tipoTicketRepo,
      tipoOperacionRepo,
      usuarioMasterChecker,
      masterAgentes,
      permisosTipo,
      stateMachineFactory,
      txRunner,
      eventPublisher,
      alCommitear,
    };
  }

  it('happy desde NUEVO: asigna y avanza NUEVO→ASIGNADO→EN_PROCESO con 1 ASIGNACION + 2 CAMBIO_ESTADO', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    const ticket = result.getValue();
    expect(ticket.asignadoId).toBe('agente-uuid');
    expect(ticket.estadoId).toBe(ESTADOS.EN_PROCESO.id);

    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.ticketRepo.save).toHaveBeenCalledTimes(1);
    // 1 ASIGNACION + 2 CAMBIO_ESTADO.
    expect(c.operacionRepo.save).toHaveBeenCalledTimes(3);

    const ops = c.operacionRepo.save.mock.calls.map((call) => call[0]);
    expect(ops[0].tipoOperacionId).toBe('tipo-op-asignacion-uuid');
    expect(ops[0].estadoAnteriorId).toBeNull();
    expect(ops[0].estadoNuevoId).toBeNull();
    // Primer salto NUEVO→ASIGNADO.
    expect(ops[1].tipoOperacionId).toBe('tipo-op-cambio-uuid');
    expect(ops[1].estadoAnteriorId).toBe(ESTADOS.NUEVO.id);
    expect(ops[1].estadoNuevoId).toBe(ESTADOS.ASIGNADO.id);
    // Segundo salto ASIGNADO→EN_PROCESO.
    expect(ops[2].estadoAnteriorId).toBe(ESTADOS.ASIGNADO.id);
    expect(ops[2].estadoNuevoId).toBe(ESTADOS.EN_PROCESO.id);
  });

  // odd/escrituras-manuales-con-lock (S4): la primera carga sirve para el 404 y master; dentro
  // de la tx se bloquea la fila y se RELEE antes de escribir, así la decisión mira el estado vigente.
  it('dentro de la transacción bloquea la fila y relee el ticket antes de escribir', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));

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
      .mockResolvedValueOnce(makeTicket('NUEVO'))
      .mockResolvedValueOnce(makeTicket('CERRADO'));

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketCerradoNoReasignableError);
    expect(c.ticketRepo.save).not.toHaveBeenCalled();
    expect(c.operacionRepo.save).not.toHaveBeenCalled();
    expect(c.txRunner.alCommitear).not.toHaveBeenCalled();
  });

  it('happy desde ASIGNADO: solo avanza →EN_PROCESO (1 ASIGNACION + 1 CAMBIO_ESTADO)', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('ASIGNADO'));

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    expect(result.getValue().estadoId).toBe(ESTADOS.EN_PROCESO.id);
    expect(c.operacionRepo.save).toHaveBeenCalledTimes(2);
    const ops = c.operacionRepo.save.mock.calls.map((call) => call[0]);
    expect(ops[1].estadoAnteriorId).toBe(ESTADOS.ASIGNADO.id);
    expect(ops[1].estadoNuevoId).toBe(ESTADOS.EN_PROCESO.id);
  });

  it('asignado inactivo/fuera del tenant → AsignadoInvalidoError, sin tx', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));
    c.usuarioMasterChecker.estaActivoEnTenant.mockResolvedValue(false);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(AsignadoInvalidoError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('asignado sin LECTURA sobre el tipo del ticket (sí sobre otro) → AsignadoNoElegibleError, sin tx', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));
    await c.permisosTipo.reemplazarDeUsuario('agente-uuid', [
      { tipoId: 'tipo-mantenimiento-uuid', accion: 'LECTURA' },
    ]);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(AsignadoNoElegibleError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
    expect(c.ticketRepo.save).not.toHaveBeenCalled();
  });

  it('estado terminal/posterior (RESUELTO) → TransicionInvalidaError, sin mutar ni tx', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('RESUELTO'));

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TransicionInvalidaError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
    expect(c.ticketRepo.save).not.toHaveBeenCalled();
  });

  it('ticket inexistente → TicketNoEncontradoError, sin tocar checkers/tx', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(c.usuarioMasterChecker.estaActivoEnTenant).not.toHaveBeenCalled();
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it.each(['CERRADO', 'CANCELADO'])(
    'M1: ticket %s → TicketCerradoNoReasignableError antes de consultar master o resolver pasos',
    async (estado) => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket(estado));

      const result = await c.useCase.execute(baseDto());

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TicketCerradoNoReasignableError);
      expect(c.usuarioMasterChecker.estaActivoEnTenant).not.toHaveBeenCalled();
      expect(c.stateMachineFactory.resolve).not.toHaveBeenCalled();
      expect(c.txRunner.run).not.toHaveBeenCalled();
      expect(c.txRunner.alCommitear).not.toHaveBeenCalled();
      expect(c.operacionRepo.save).not.toHaveBeenCalled();
    },
  );

  it('N1: ticket.asignado MANUAL con autorId del actor, publicado solo al correr la cola de alCommitear', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));

    await c.useCase.execute(baseDto());

    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
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

  it('un rechazo (RESUELTO) no publica ticket.asignado', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('RESUELTO'));

    await c.useCase.execute(baseDto());

    expect(c.txRunner.alCommitear).not.toHaveBeenCalled();
  });

  describe('permisos por tipo (odd/permisos-por-tipo-ticket, S2, S3, S6)', () => {
    // Mismo usuario: Soporte con Ver, Asignar y Estado; Mantenimiento con Ver y Asignar (sin
    // Estado); Electricidad sin nada.
    const alcance = alcancePorTipo('solicitante-uuid', {
      'tipo-soporte-uuid': ['LECTURA', 'ASIGNAR', 'TRANSICIONAR'],
      'tipo-mantenimiento-uuid': ['LECTURA', 'ASIGNAR'],
    });

    it('asigna y pone en proceso un ticket de un tipo con ASIGNAR y TRANSICIONAR', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));

      const result = await c.useCase.execute(baseDto(alcance));

      expect(result.isOk()).toBe(true);
      expect(c.ticketRepo.save).toHaveBeenCalledTimes(1);
    });

    it('un ticket de un tipo con ASIGNAR pero sin TRANSICIONAR es 403; no se escribe nada', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO', 'tipo-mantenimiento-uuid'));

      const result = await c.useCase.execute(baseDto(alcance));

      expect(result.getError()).toBeInstanceOf(AccionSobreTipoNoPermitidaError);
      expect(result.getError().message).toContain('"TRANSICIONAR"');
      expect(c.txRunner.run).not.toHaveBeenCalled();
      expect(c.ticketRepo.save).not.toHaveBeenCalled();
      expect(c.operacionRepo.save).not.toHaveBeenCalled();
      expect(c.alCommitear).toHaveLength(0);
    });

    it('un ticket de un tipo sin LECTURA es 404; no se escribe nada', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO', 'tipo-electricidad-uuid'));

      const result = await c.useCase.execute(baseDto(alcance));

      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(c.txRunner.run).not.toHaveBeenCalled();
      expect(c.ticketRepo.save).not.toHaveBeenCalled();
    });

    it('un ticket que el actor no ve por fila (sin VER_TODOS, ni solicitante, ni responsable, ni tarea) es 404', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));

      const result = await c.useCase.execute(
        baseDto(
          alcancePorTipo('asignador-uuid', {
            'tipo-soporte-uuid': ['LECTURA', 'ASIGNAR', 'TRANSICIONAR'],
          }),
        ),
      );

      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(c.ticketRepo.esVisiblePara).toHaveBeenCalledWith('ticket-uuid', 'asignador-uuid');
      expect(c.txRunner.run).not.toHaveBeenCalled();
    });

    it('sin restricción (ROOT o ADMINISTRADOR) pasa el acceso en un tipo sin filas', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO', 'tipo-electricidad-uuid'));
      // El asignado es ADMINISTRADOR: elegible para un tipo sin filas.
      c.masterAgentes.agregar({ id: 'admin-uuid', rol: 'ADMINISTRADOR', celdas: [] });

      const result = await c.useCase.execute(
        baseDto({ ...alcanceSinRestriccion('asignador-uuid'), asignadoId: 'admin-uuid' }),
      );

      expect(result.isOk()).toBe(true);
      expect(c.ticketRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});
