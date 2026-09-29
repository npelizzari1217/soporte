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
});
