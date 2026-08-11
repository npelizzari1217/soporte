/**
 * T4.1/T4.2 [UNIT] — RED→GREEN: `CrearTicketCompraUseCase`.
 *
 * Todos los puertos mockeados (`vi.fn`) — sin DB. Crea, en UNA transacción,
 * el `Ticket` base (tipo de compra ELEGIDO por el caller vía `tipoId`,
 * validado con `tipoTicketRepo.findById` — B1), la operación de apertura
 * CAMBIO_ESTADO, y el satélite `ticket_compra` (ADR-3). Valida solicitante
 * (master) y ciclo activo del tenant.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C1. Ref design: ADR-3,
 * "Firmas TS clave" (CrearTicketCompraDto). Tarea: T4.1, T4.2.
 */
import { CrearTicketCompraUseCase, CrearTicketCompraDto } from './crear-ticket-compra.use-case';
import { Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { CicloClienteEntity } from '../../../tickets/domain/entities/ciclo-cliente.entity';
import { TipoTicketEntity } from '../../../tickets/domain/entities/tipo-ticket.entity';
import {
  SolicitanteInvalidoError,
  SinCicloActivoError,
  TipoTicketNoEncontradoError,
  TipoTicketModuloNoCorrespondeError,
} from '../../../tickets/domain/errors/tickets.errors';

function baseDto(overrides: Partial<CrearTicketCompraDto> = {}): CrearTicketCompraDto {
  return {
    titulo: 'Compra de notebooks',
    descripcion: 'Para el equipo de soporte',
    tipoId: 'tipo-compras-uuid',
    prioridadId: 'prioridad-media-uuid',
    solicitanteId: 'solicitante-uuid',
    clienteId: 'cliente-uuid',
    autorId: 'solicitante-uuid',
    anio: 2026,
    ...overrides,
  };
}

describe('CrearTicketCompraUseCase', () => {
  function makeCollaborators() {
    const ticketRepo = { save: vi.fn().mockResolvedValue(undefined) };
    const operacionRepo = { save: vi.fn().mockResolvedValue(undefined) };
    const ticketCompraRepo = { save: vi.fn().mockResolvedValue(undefined) };
    const estadoRepo = { findIdByCodigo: vi.fn().mockResolvedValue('estado-nuevo-uuid') };
    const tipoTicketRepo = {
      findById: vi
        .fn()
        .mockResolvedValue(
          TipoTicketEntity.create(
            { codigo: 'COMPRAS', nombre: 'Compras', modulo: 'COMPRAS', activo: true },
            'tipo-compras-uuid',
          ),
        ),
    };
    const tipoOperacionRepo = {
      findIdByCodigo: vi.fn().mockResolvedValue('tipo-op-cambio-estado-uuid'),
    };
    const usuarioMasterChecker = { existeEnTenant: vi.fn().mockResolvedValue(true) };
    const numerador = { generarNumero: vi.fn().mockResolvedValue(Result.ok('COM-2026-00001')) };
    const resolverCicloActivo = {
      resolver: vi.fn().mockResolvedValue(
        Result.ok(
          CicloClienteEntity.create(
            {
              cicloVigenteId: 'ciclo-vigente-uuid',
              nombre: 'Ciclo 2026',
              fechaInicio: new Date('2026-01-01'),
              fechaFin: new Date('2026-12-31'),
              activo: true,
            },
            'ciclo-activo-uuid',
          ),
        ),
      ),
    };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new CrearTicketCompraUseCase(
      ticketRepo as never,
      operacionRepo as never,
      ticketCompraRepo as never,
      estadoRepo as never,
      tipoTicketRepo as never,
      tipoOperacionRepo as never,
      usuarioMasterChecker as never,
      numerador as never,
      resolverCicloActivo as never,
      txRunner as never,
    );

    return {
      useCase,
      ticketRepo,
      operacionRepo,
      ticketCompraRepo,
      estadoRepo,
      tipoTicketRepo,
      tipoOperacionRepo,
      usuarioMasterChecker,
      numerador,
      resolverCicloActivo,
      txRunner,
    };
  }

  it('F3-C1: crea ticket base (tipo COMPRAS, NUEVO, numero COM-) + operacion de apertura + satelite, en la tx', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    const { ticket, ticketCompra } = result.getValue();
    expect(ticket).toBeInstanceOf(TicketEntity);
    expect(ticket.numero).toBe('COM-2026-00001');
    expect(ticket.tipoId).toBe('tipo-compras-uuid');
    expect(ticket.estadoId).toBe('estado-nuevo-uuid');
    expect(ticket.solicitanteId).toBe('solicitante-uuid');
    expect(ticket.cicloId).toBe('ciclo-activo-uuid');

    expect(c.tipoTicketRepo.findById).toHaveBeenCalledWith('tipo-compras-uuid');
    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.ticketRepo.save).toHaveBeenCalledWith(ticket);
    expect(c.operacionRepo.save).toHaveBeenCalledTimes(1);
    const operacionGuardada = c.operacionRepo.save.mock.calls[0][0];
    expect(operacionGuardada.estadoAnteriorId).toBeNull();
    expect(operacionGuardada.estadoNuevoId).toBe('estado-nuevo-uuid');

    expect(c.ticketCompraRepo.save).toHaveBeenCalledTimes(1);
    expect(c.ticketCompraRepo.save).toHaveBeenCalledWith(ticketCompra);
    expect(ticketCompra.ticketId).toBe(ticket.id);
    expect(ticketCompra.estaDecidida).toBe(false);
  });

  it('solicitante invalido → SolicitanteInvalidoError, sin tocar la tx', async () => {
    const c = makeCollaborators();
    c.usuarioMasterChecker.existeEnTenant.mockResolvedValue(false);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SolicitanteInvalidoError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('sin ciclo activo → propaga SinCicloActivoError, sin tocar la tx', async () => {
    const c = makeCollaborators();
    c.resolverCicloActivo.resolver.mockResolvedValue(Result.fail(new SinCicloActivoError()));

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SinCicloActivoError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('tipoId inexistente en el catálogo del tenant → TipoTicketNoEncontradoError, sin tocar la tx', async () => {
    const c = makeCollaborators();
    c.tipoTicketRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto({ tipoId: 'tipo-inexistente-uuid' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoTicketNoEncontradoError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('B2: tipo de OTRO módulo (no COMPRAS) → TipoTicketModuloNoCorrespondeError, sin tocar la tx', async () => {
    const c = makeCollaborators();
    // Un tipo válido pero del módulo SOPORTE: el alta de compras debe rechazarlo.
    c.tipoTicketRepo.findById.mockResolvedValue(
      TipoTicketEntity.create(
        { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'SOPORTE', activo: true },
        'tipo-soporte-uuid',
      ),
    );

    const result = await c.useCase.execute(baseDto({ tipoId: 'tipo-soporte-uuid' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoTicketModuloNoCorrespondeError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });
});
