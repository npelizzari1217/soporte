/**
 * T8.1 [UNIT][RED] — `CrearTicketEdilicioUseCase`.
 *
 * base+satélite en 1 tx; `ubicacion` es texto libre opcional (sin catálogo
 * que validar, ex-Ubicacion removido); numero EDI-.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E1. Ref design: ADR-3.
 * Tarea: T8.1, T8.2.
 */
import { Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { CicloClienteEntity } from '../../../tickets/domain/entities/ciclo-cliente.entity';
import { CrearTicketEdilicioUseCase } from './crear-ticket-edilicio.use-case';
import { TipoTicketEntity } from '../../../tickets/domain/entities/tipo-ticket.entity';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { NumeradorTicket } from '../../../tickets/domain/services/numerador-ticket.service';
import { ResolverCicloActivoParaCreacion } from '../../../tickets/application/services/resolver-ciclo-activo.service';
import { ResolverAsignacionAutomatica } from '../../../tickets/application/services/resolver-asignacion-automatica.service';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../../tickets/domain/ports/i-operacion-ticket.repository';
import { IEstadoRepository } from '../../../tickets/domain/ports/i-estado.repository';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import { ISectorRepository } from '../../../sectores/domain/ports/i-sector.repository';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import {
  SectorTicketInexistenteError,
  SolicitanteInvalidoError,
} from '../../../tickets/domain/errors/tickets.errors';
import { SectorEntity } from '../../../sectores/domain/entities/sector.entity';
import { TicketCreadoEvent } from '../../../tickets/domain/events/ticket-creado.event';
import { TicketAsignadoEvent } from '../../../tickets/domain/events/ticket-asignado.event';
import { AUTOR_SISTEMA } from '../../../tickets/domain/constants/autor-sistema.constants';

function makeCicloActivo(): CicloClienteEntity {
  return CicloClienteEntity.reconstitute(
    {
      cicloVigenteId: 'ciclo-vigente-uuid',
      nombre: 'Ciclo 2026',
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2026-12-31'),
      activo: true,
    },
    'ciclo-activo-uuid',
    new Date(),
    new Date(),
    null,
  );
}

/** Operación guardada con ese tipo; falla si no se guardó ninguna (en vez de seguir con `undefined`). */
function operacionDelTipo(
  ops: OperacionTicketEntity[],
  tipoOperacionId: string,
): OperacionTicketEntity {
  const op = ops.find((o) => o.tipoOperacionId === tipoOperacionId);
  if (!op) {
    throw new Error(`No se guardó ninguna operación de tipo ${tipoOperacionId}`);
  }
  return op;
}

describe('CrearTicketEdilicioUseCase', () => {
  function buildDeps() {
    const ticketRepo = { save: vi.fn<ITicketRepository['save']>() };
    const operacionRepo = { save: vi.fn<IOperacionTicketRepository['save']>() };
    const ticketEdiliciaRepo = { save: vi.fn<ITicketEdiliciaRepository['save']>() };
    const estadoRepo = {
      findIdByCodigo: vi
        .fn<IEstadoRepository['findIdByCodigo']>()
        .mockResolvedValue('estado-nuevo-uuid'),
    };
    const tipoTicketRepo = {
      findByCodigo: vi
        .fn<ITipoTicketRepository['findByCodigo']>()
        .mockResolvedValue(
          TipoTicketEntity.create(
            { codigo: 'EDILICIA', nombre: 'Edilicia', modulo: 'EDILICIA', activo: true },
            'tipo-edilicia-uuid',
          ),
        ),
    };
    const tipoOperacionRepo = {
      findIdByCodigo: vi
        .fn<ITipoOperacionRepository['findIdByCodigo']>()
        .mockResolvedValue('tipo-operacion-uuid'),
    };
    const usuarioMasterChecker = {
      existeEnTenant: vi.fn<IUsuarioMasterChecker['existeEnTenant']>().mockResolvedValue(true),
    };
    const numerador = {
      generarNumero: vi
        .fn<NumeradorTicket['generarNumero']>()
        .mockResolvedValue(Result.ok('EDI-2026-00001')),
    };
    const resolverCicloActivo = {
      resolver: vi
        .fn<ResolverCicloActivoParaCreacion['resolver']>()
        .mockResolvedValue(Result.ok(makeCicloActivo())),
    };
    const resolverAsignacion = {
      resolver: vi.fn<ResolverAsignacionAutomatica['resolver']>().mockResolvedValue(null),
    };
    // `run` es genérico y un `vi.fn` lo perdería: runner real con un espía encima.
    const txRunner = {
      run: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
      alCommitear: vi.fn<ITenantTransactionRunner['alCommitear']>((fn) => fn()),
    };
    vi.spyOn(txRunner, 'run');
    const eventPublisher = { publish: vi.fn<IDomainEventPublisher['publish']>() };
    const sectorRepo = {
      findById: vi.fn<ISectorRepository['findById']>(async (id) =>
        id === 'sector-uuid'
          ? SectorEntity.create(
              { codigo: 'MANT', nombre: 'Mantenimiento', activo: true },
              'sector-uuid',
            )
          : null,
      ),
    };

    const useCase = new CrearTicketEdilicioUseCase(
      ticketRepo,
      operacionRepo,
      ticketEdiliciaRepo,
      estadoRepo,
      tipoTicketRepo,
      tipoOperacionRepo,
      usuarioMasterChecker,
      numerador,
      resolverCicloActivo,
      resolverAsignacion,
      eventPublisher,
      txRunner,
      sectorRepo,
    );

    return {
      useCase,
      sectorRepo,
      ticketRepo,
      operacionRepo,
      ticketEdiliciaRepo,
      usuarioMasterChecker,
      eventPublisher,
      resolverAsignacion,
      txRunner,
    };
  }

  const baseDto = {
    titulo: 'Reparar cañería',
    descripcion: null,
    prioridadId: 'prioridad-media-uuid',
    ubicacion: 'Edificio Central',
    solicitanteId: 'usuario-uuid',
    clienteId: 'cliente-uuid',
    autorId: 'usuario-uuid',
    anio: 2026,
  };

  it('crea ticket base + satélite ticket_edilicia en una transacción, numero EDI-', async () => {
    const { useCase, ticketRepo, operacionRepo, ticketEdiliciaRepo } = buildDeps();

    const result = await useCase.execute(baseDto);

    expect(result.isOk()).toBe(true);
    const { ticket, ticketEdilicia } = result.getValue();
    expect(ticket).toBeInstanceOf(TicketEntity);
    expect(ticket.numero).toBe('EDI-2026-00001');
    expect(ticketEdilicia.ticketId).toBe(ticket.id);
    expect(ticketEdilicia.ubicacion).toBe('Edificio Central');
    expect(ticketRepo.save).toHaveBeenCalledWith(ticket);
    expect(operacionRepo.save).toHaveBeenCalled();
    expect(ticketEdiliciaRepo.save).toHaveBeenCalledWith(ticketEdilicia);
  });

  it('ubicacion es opcional — null si no se provee', async () => {
    const { useCase } = buildDeps();

    const result = await useCase.execute({ ...baseDto, ubicacion: null });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().ticketEdilicia.ubicacion).toBeNull();
  });

  describe('sector (odd/ubicacion-sector-ticket)', () => {
    it('guarda el sector en el ticket y deja la Ubicacion general en null', async () => {
      const { useCase } = buildDeps();

      const result = await useCase.execute({ ...baseDto, sectorId: 'sector-uuid' });

      const { ticket, ticketEdilicia } = result.getValue();
      expect(ticket.sectorId).toBe('sector-uuid');
      expect(ticket.ubicacion).toBeNull();
      expect(ticketEdilicia.ubicacion).toBe('Edificio Central');
      expect(result.getValue().sectorNombre).toBe('Mantenimiento');
    });

    it('sin sectorId no consulta el catalogo y el ticket queda sin sector', async () => {
      const { useCase, sectorRepo } = buildDeps();

      const result = await useCase.execute(baseDto);

      expect(result.getValue().ticket.sectorId).toBeNull();
      expect(result.getValue().sectorNombre).toBeNull();
      expect(sectorRepo.findById).not.toHaveBeenCalled();
    });

    it('sector inexistente → SectorTicketInexistenteError, sin persistir', async () => {
      const { useCase, ticketRepo } = buildDeps();

      const result = await useCase.execute({ ...baseDto, sectorId: 'no-existe' });

      expect(result.getError()).toBeInstanceOf(SectorTicketInexistenteError);
      expect(ticketRepo.save).not.toHaveBeenCalled();
    });
  });

  it('falla con SolicitanteInvalidoError si el solicitante no existe en el tenant', async () => {
    const { useCase, usuarioMasterChecker } = buildDeps();
    usuarioMasterChecker.existeEnTenant.mockResolvedValue(false);

    const result = await useCase.execute(baseDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SolicitanteInvalidoError);
  });

  it('publica TicketCreadoEvent POST-COMMIT con ticketId/prioridadId (dispara AplicarSlaListener)', async () => {
    const { useCase, eventPublisher } = buildDeps();

    const result = await useCase.execute(baseDto);
    const { ticket } = result.getValue();

    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    const evento = eventPublisher.publish.mock.calls[0][0];
    expect(evento).toBeInstanceOf(TicketCreadoEvent);
    if (!(evento instanceof TicketCreadoEvent)) {
      throw new Error('se esperaba un TicketCreadoEvent');
    }
    expect(evento.ticketId).toBe(ticket.id);
    expect(evento.prioridadId).toBe(baseDto.prioridadId);
  });

  it('no publica el evento si la creación falla (solicitante inválido)', async () => {
    const { useCase, usuarioMasterChecker, eventPublisher } = buildDeps();
    usuarioMasterChecker.existeEnTenant.mockResolvedValue(false);

    await useCase.execute(baseDto);

    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  describe('asignación automática por regla del tipo (A1, A3, A4, A6, A7, A8, N1)', () => {
    const ASIGNACION = {
      asignadoId: 'u-responsable',
      estadoAsignadoId: 'estado-asignado-uuid',
      tipoOperacionAsignacionId: 'tipo-op-asignacion-uuid',
    };

    it('con regla: nace ASIGNADO con asignado_id, apertura null→ASIGNADO y ASIGNACION del sistema', async () => {
      const { useCase, resolverAsignacion, operacionRepo } = buildDeps();
      resolverAsignacion.resolver.mockResolvedValue(ASIGNACION);

      const result = await useCase.execute(baseDto);

      const { ticket } = result.getValue();
      expect(ticket.estadoId).toBe('estado-asignado-uuid');
      expect(ticket.asignadoId).toBe('u-responsable');
      expect(resolverAsignacion.resolver).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tipo-edilicia-uuid' }),
        'cliente-uuid',
      );
      const ops = operacionRepo.save.mock.calls.map(([op]) => op);
      expect(ops).toHaveLength(2);
      const apertura = operacionDelTipo(ops, 'tipo-operacion-uuid');
      const asignacion = operacionDelTipo(ops, 'tipo-op-asignacion-uuid');
      expect(apertura.estadoAnteriorId).toBeNull();
      expect(apertura.estadoNuevoId).toBe('estado-asignado-uuid');
      expect(apertura.autorId).toBe('usuario-uuid');
      expect(asignacion.autorId).toBe(AUTOR_SISTEMA);
    });

    it('sin regla o regla rota (el resolver devuelve null): NUEVO, sin asignado, una operación y solo ticket.creado', async () => {
      const { useCase, operacionRepo, eventPublisher } = buildDeps();

      const result = await useCase.execute(baseDto);

      expect(result.isOk()).toBe(true);
      expect(result.getValue().ticket.estadoId).toBe('estado-nuevo-uuid');
      expect(result.getValue().ticket.asignadoId).toBeNull();
      expect(operacionRepo.save).toHaveBeenCalledTimes(1);
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    });

    it('con regla: ticket.asignado REGLA_TIPO después de ticket.creado, solo al correr la cola de alCommitear', async () => {
      const { useCase, resolverAsignacion, txRunner, eventPublisher } = buildDeps();
      resolverAsignacion.resolver.mockResolvedValue(ASIGNACION);
      const cola: Array<() => void> = [];
      txRunner.alCommitear.mockImplementation((fn: () => void) => {
        cola.push(fn);
      });

      const result = await useCase.execute(baseDto);

      expect(eventPublisher.publish).not.toHaveBeenCalled();
      cola.forEach((fn) => fn());
      const eventos = eventPublisher.publish.mock.calls.map(([e]) => e);
      expect(eventos[0]).toBeInstanceOf(TicketCreadoEvent);
      expect(eventos[1]).toBeInstanceOf(TicketAsignadoEvent);
      expect(eventos[1]).toMatchObject({
        ticketId: result.getValue().ticket.id,
        asignadoId: 'u-responsable',
        origen: 'REGLA_TIPO',
        autorId: null,
      });
      expect(eventos).toHaveLength(2);
    });

    it('si el resolver rechaza (consulta de tenant), el alta rechaza sin abrir la transacción', async () => {
      const { useCase, resolverAsignacion, txRunner } = buildDeps();
      resolverAsignacion.resolver.mockRejectedValue(new Error('tenant caido'));

      await expect(useCase.execute(baseDto)).rejects.toThrow('tenant caido');
      expect(txRunner.run).not.toHaveBeenCalled();
    });
  });
});
