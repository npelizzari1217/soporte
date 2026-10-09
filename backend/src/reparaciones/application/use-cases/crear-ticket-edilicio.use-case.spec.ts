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
import { SolicitanteInvalidoError } from '../../../tickets/domain/errors/tickets.errors';
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

describe('CrearTicketEdilicioUseCase', () => {
  function buildDeps() {
    const ticketRepo = { save: vi.fn() };
    const operacionRepo = { save: vi.fn() };
    const ticketEdiliciaRepo = { save: vi.fn() };
    const estadoRepo = { findIdByCodigo: vi.fn().mockResolvedValue('estado-nuevo-uuid') };
    const tipoTicketRepo = {
      findByCodigo: vi.fn().mockResolvedValue({ id: 'tipo-edilicia-uuid', codigo: 'EDILICIA' }),
    };
    const tipoOperacionRepo = { findIdByCodigo: vi.fn().mockResolvedValue('tipo-operacion-uuid') };
    const usuarioMasterChecker = { existeEnTenant: vi.fn().mockResolvedValue(true) };
    const numerador = { generarNumero: vi.fn().mockResolvedValue(Result.ok('EDI-2026-00001')) };
    const resolverCicloActivo = {
      resolver: vi.fn().mockResolvedValue(Result.ok(makeCicloActivo())),
    };
    const resolverAsignacion = { resolver: vi.fn().mockResolvedValue(null) };
    const txRunner = {
      run: vi.fn((fn: () => Promise<unknown>) => fn()),
      alCommitear: vi.fn((fn: () => void) => fn()),
    };
    const eventPublisher = { publish: vi.fn() };

    const useCase = new CrearTicketEdilicioUseCase(
      ticketRepo as any,
      operacionRepo as any,
      ticketEdiliciaRepo as any,
      estadoRepo as any,
      tipoTicketRepo as any,
      tipoOperacionRepo as any,
      usuarioMasterChecker as any,
      numerador as any,
      resolverCicloActivo as any,
      resolverAsignacion,
      eventPublisher,
      txRunner as any,
    );

    return {
      useCase,
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
    expect(ticketEdilicia.porcentajeAvance).toBe(0);
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
      const apertura = ops.find((o) => o.tipoOperacionId === 'tipo-operacion-uuid');
      const asignacion = ops.find((o) => o.tipoOperacionId === 'tipo-op-asignacion-uuid');
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
