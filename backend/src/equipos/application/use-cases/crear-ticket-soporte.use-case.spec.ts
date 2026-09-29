import { describe, it, expect, vi } from 'vitest';
import { CrearTicketSoporteUseCase } from './crear-ticket-soporte.use-case';
import { CicloClienteEntity } from '../../../tickets/domain/entities/ciclo-cliente.entity';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { EquipoInvalidoError } from '../../domain/errors/equipos.errors';
import { Result } from '../../../shared/domain/result';
import { SolicitanteInvalidoError } from '../../../tickets/domain/errors/tickets.errors';
import { TicketCreadoEvent } from '../../../tickets/domain/events/ticket-creado.event';

/**
 * T13.1 [U][RED] — CrearTicketSoporteUseCase: base+satélite tx; equipoId
 * null → crea OK; equipoId inválido/inactivo/eliminado → EquipoInvalidoError;
 * numero SOP-.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q4.
 */
describe('CrearTicketSoporteUseCase', () => {
  function makeDeps() {
    const ticketRepo = { save: vi.fn().mockResolvedValue(undefined) };
    const operacionRepo = { save: vi.fn().mockResolvedValue(undefined) };
    const ticketSoporteRepo = { save: vi.fn().mockResolvedValue(undefined) };
    const equipoRepo = { findById: vi.fn().mockResolvedValue(null) };
    const estadoRepo = { findIdByCodigo: vi.fn().mockResolvedValue('estado-nuevo-id') };
    const tipoTicketRepo = {
      findByCodigo: vi.fn().mockResolvedValue({ id: 'tipo-soporte-id', codigo: 'SOPORTE' }),
    };
    const tipoOperacionRepo = { findIdByCodigo: vi.fn().mockResolvedValue('tipo-op-apertura-id') };
    const usuarioMasterChecker = { existeEnTenant: vi.fn().mockResolvedValue(true) };
    const numerador = { generarNumero: vi.fn().mockResolvedValue(Result.ok('SOP-2026-00001')) };
    const resolverCicloActivo = {
      resolver: vi.fn().mockResolvedValue(
        Result.ok(
          CicloClienteEntity.create(
            {
              cicloVigenteId: 'ciclo-vigente-1',
              nombre: 'Ciclo activo',
              fechaInicio: new Date('2026-01-01'),
              fechaFin: new Date('2026-12-31'),
              activo: true,
            },
            'ciclo-1',
          ),
        ),
      ),
    };
    const txRunner = {
      run: vi.fn((fn: () => Promise<unknown>) => fn()),
      alCommitear: vi.fn((fn: () => void) => fn()),
    };
    const eventPublisher = { publish: vi.fn() };
    return {
      ticketRepo,
      operacionRepo,
      ticketSoporteRepo,
      equipoRepo,
      estadoRepo,
      tipoTicketRepo,
      tipoOperacionRepo,
      usuarioMasterChecker,
      numerador,
      resolverCicloActivo,
      eventPublisher,
      txRunner,
    };
  }

  function baseDto(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      titulo: 'No tengo acceso a la VPN',
      descripcion: null,
      prioridadId: 'prioridad-media',
      equipoId: null,
      descripcionProblema: 'No conecta desde ayer',
      solicitanteId: 'usuario-1',
      clienteId: 'cliente-1',
      autorId: 'usuario-1',
      anio: 2026,
      ...overrides,
    };
  }

  function buildUseCase(deps: ReturnType<typeof makeDeps>) {
    return new CrearTicketSoporteUseCase(
      deps.ticketRepo as never,
      deps.operacionRepo as never,
      deps.ticketSoporteRepo as never,
      deps.estadoRepo as never,
      deps.tipoTicketRepo as never,
      deps.tipoOperacionRepo as never,
      deps.usuarioMasterChecker as never,
      deps.numerador as never,
      deps.resolverCicloActivo as never,
      deps.equipoRepo as never,
      deps.eventPublisher,
      deps.txRunner as never,
    );
  }

  it('crea el ticket con equipoId=null (soporte de red/accesos sin equipo)', async () => {
    const deps = makeDeps();
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    const { ticket, ticketSoporte } = result.getValue();
    expect(ticket.numero).toBe('SOP-2026-00001');
    expect(ticketSoporte.equipoId).toBeNull();
    expect(deps.equipoRepo.findById).not.toHaveBeenCalled();
  });

  it('crea el ticket con equipoId válido (activo y no eliminado)', async () => {
    const deps = makeDeps();
    const equipo = EquipoInformaticoEntity.create(
      {
        nombre: 'Notebook',
        numeroSerie: null,
        marca: null,
        modelo: null,
        fechaAdquisicion: null,
        ubicacion: null,
        importe: null,
        fechaValoracion: null,
        observaciones: null,
        valorResidual: null,
        fechaValorResidual: null,
      },
      'equipo-1',
    );
    deps.equipoRepo.findById.mockResolvedValue(equipo);
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(baseDto({ equipoId: 'equipo-1' }));

    expect(result.isOk()).toBe(true);
    expect(result.getValue().ticketSoporte.equipoId).toBe('equipo-1');
  });

  it('falla con EquipoInvalidoError si el equipo no existe', async () => {
    const deps = makeDeps();
    deps.equipoRepo.findById.mockResolvedValue(null);
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(baseDto({ equipoId: 'no-existe' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoInvalidoError);
    expect(deps.ticketRepo.save).not.toHaveBeenCalled();
  });

  it('falla con EquipoInvalidoError si el equipo está inactivo', async () => {
    const deps = makeDeps();
    const equipo = EquipoInformaticoEntity.create(
      {
        nombre: 'Notebook',
        numeroSerie: null,
        marca: null,
        modelo: null,
        fechaAdquisicion: null,
        ubicacion: null,
        importe: null,
        fechaValoracion: null,
        observaciones: null,
        valorResidual: null,
        fechaValorResidual: null,
      },
      'equipo-1',
    );
    equipo.deactivate();
    deps.equipoRepo.findById.mockResolvedValue(equipo);
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(baseDto({ equipoId: 'equipo-1' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoInvalidoError);
  });

  it('falla con EquipoInvalidoError si el equipo fue eliminado (soft delete)', async () => {
    const deps = makeDeps();
    const equipo = EquipoInformaticoEntity.create(
      {
        nombre: 'Notebook',
        numeroSerie: null,
        marca: null,
        modelo: null,
        fechaAdquisicion: null,
        ubicacion: null,
        importe: null,
        fechaValoracion: null,
        observaciones: null,
        valorResidual: null,
        fechaValorResidual: null,
      },
      'equipo-1',
    );
    equipo.softDelete();
    deps.equipoRepo.findById.mockResolvedValue(equipo);
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(baseDto({ equipoId: 'equipo-1' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoInvalidoError);
  });

  it('falla con SolicitanteInvalidoError si el solicitante no existe en el tenant', async () => {
    const deps = makeDeps();
    deps.usuarioMasterChecker.existeEnTenant.mockResolvedValue(false);
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SolicitanteInvalidoError);
  });

  it('el ticket base y el satélite se persisten dentro de la misma transacción', async () => {
    const deps = makeDeps();
    const useCase = buildUseCase(deps);

    await useCase.execute(baseDto());

    expect(deps.txRunner.run).toHaveBeenCalledTimes(1);
    expect(deps.ticketRepo.save).toHaveBeenCalledTimes(1);
    expect(deps.operacionRepo.save).toHaveBeenCalledTimes(1);
    expect(deps.ticketSoporteRepo.save).toHaveBeenCalledTimes(1);
  });

  it('publica TicketCreadoEvent POST-COMMIT con ticketId/prioridadId (dispara AplicarSlaListener)', async () => {
    const deps = makeDeps();
    const useCase = buildUseCase(deps);

    const result = await useCase.execute(baseDto());
    const { ticket } = result.getValue();

    expect(deps.eventPublisher.publish).toHaveBeenCalledTimes(1);
    const evento = deps.eventPublisher.publish.mock.calls[0][0];
    expect(evento).toBeInstanceOf(TicketCreadoEvent);
    expect(evento.ticketId).toBe(ticket.id);
    expect(evento.prioridadId).toBe('prioridad-media');
  });

  it('no publica el evento si la creación falla (equipoId invalido)', async () => {
    const deps = makeDeps();
    deps.equipoRepo.findById.mockResolvedValue(null);
    const useCase = buildUseCase(deps);

    await useCase.execute(baseDto({ equipoId: 'no-existe' }));

    expect(deps.eventPublisher.publish).not.toHaveBeenCalled();
  });
});
