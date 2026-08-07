/**
 * T5.3/T5.4 [UNIT] — RED→GREEN: `RechazarCompraUseCase` (ADR-1, ADR-2, F3-C5).
 *
 * Motivo vacío → `MotivoRechazoRequeridoError`, sin mutar nada. Con
 * motivo: setea el satélite, transiciona el `Ticket` base a CANCELADO
 * (arco válido de la máquina BASE, ADR-2 — sin máquina custom) y registra
 * una operación RECHAZO en el timeline, todo en una transacción.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C5. Ref design: ADR-1, ADR-2.
 * Tarea: T5.3, T5.4.
 */
import { RechazarCompraUseCase, RechazarCompraDto } from './rechazar-compra.use-case';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { EstadoEntity } from '../../../tickets/domain/entities/estado.entity';
import { TicketCompraEntity } from '../../domain/entities/ticket-compra.entity';
import {
  TicketNoEncontradoError,
  TransicionInvalidaError,
} from '../../../tickets/domain/errors/tickets.errors';
import {
  CompraNoEncontradaError,
  CompraYaDecididaError,
  MotivoRechazoRequeridoError,
} from '../../domain/errors/compras.errors';

function makeTicket(estadoId = 'estado-nuevo-uuid'): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'COM-2026-00001',
      titulo: 'Compra de notebooks',
      descripcion: null,
      tipoId: 'tipo-compras-uuid',
      estadoId,
      prioridadId: 'prioridad-media-uuid',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
    },
    'ticket-uuid',
  );
}

function baseDto(overrides: Partial<RechazarCompraDto> = {}): RechazarCompraDto {
  return {
    ticketId: 'ticket-uuid',
    aprobadoPorId: 'aprobador-uuid',
    motivoRechazo: 'Presupuesto excedido',
    ...overrides,
  };
}

describe('RechazarCompraUseCase', () => {
  function makeCollaborators() {
    const ticket = makeTicket('estado-nuevo-uuid');
    const ticketCompra = TicketCompraEntity.create(
      { ticketId: 'ticket-uuid' },
      'ticket-compra-uuid',
    );
    const estadoNuevo = EstadoEntity.create(
      { codigo: 'NUEVO', nombre: 'Nuevo', color: null, orden: 10, activo: true },
      'estado-nuevo-uuid',
    );
    const estadoCancelado = EstadoEntity.create(
      { codigo: 'CANCELADO', nombre: 'Cancelado', color: null, orden: 60, activo: true },
      'estado-cancelado-uuid',
    );

    const ticketRepo = {
      findById: vi.fn().mockResolvedValue(ticket),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const ticketCompraRepo = {
      findByTicketId: vi.fn().mockResolvedValue(ticketCompra),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const operacionRepo = { save: vi.fn().mockResolvedValue(undefined) };
    const estadoRepo = {
      findById: vi.fn().mockResolvedValue(estadoNuevo),
      findByCodigo: vi.fn().mockResolvedValue(estadoCancelado),
    };
    const tipoOperacionRepo = { findIdByCodigo: vi.fn().mockResolvedValue('tipo-op-rechazo-uuid') };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new RechazarCompraUseCase(
      ticketRepo as never,
      ticketCompraRepo as never,
      operacionRepo as never,
      estadoRepo as never,
      tipoOperacionRepo as never,
      txRunner as never,
    );

    return {
      useCase,
      ticket,
      ticketCompra,
      estadoNuevo,
      estadoCancelado,
      ticketRepo,
      ticketCompraRepo,
      operacionRepo,
      estadoRepo,
      tipoOperacionRepo,
      txRunner,
    };
  }

  it('F3-C5: con motivo — satelite + ticket->CANCELADO + timeline RECHAZO, en una tx', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    const { ticket: ticketResultante, ticketCompra: ticketCompraResultante } = result.getValue();
    expect(ticketResultante.estadoId).toBe('estado-cancelado-uuid');
    expect(ticketCompraResultante.rechazada).toBe(true);
    expect(c.ticket.estadoId).toBe('estado-cancelado-uuid');
    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.ticketRepo.save).toHaveBeenCalledWith(c.ticket);
    expect(c.ticketCompraRepo.save).toHaveBeenCalledWith(c.ticketCompra);

    expect(c.operacionRepo.save).toHaveBeenCalledTimes(1);
    const operacion = c.operacionRepo.save.mock.calls[0][0];
    expect(operacion.tipoOperacionId).toBe('tipo-op-rechazo-uuid');
    expect(operacion.estadoAnteriorId).toBe('estado-nuevo-uuid');
    expect(operacion.estadoNuevoId).toBe('estado-cancelado-uuid');
  });

  it('motivo vacio → MotivoRechazoRequeridoError, sin mutar nada', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute(baseDto({ motivoRechazo: '' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(MotivoRechazoRequeridoError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
    expect(c.ticket.estadoId).toBe('estado-nuevo-uuid');
  });

  it('motivo solo espacios → MotivoRechazoRequeridoError', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute(baseDto({ motivoRechazo: '   ' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(MotivoRechazoRequeridoError);
  });

  it('ticket inexistente → TicketNoEncontradoError', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
  });

  it('ticket_compra inexistente → CompraNoEncontradaError', async () => {
    const c = makeCollaborators();
    c.ticketCompraRepo.findByTicketId.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
  });

  it('ya decidida (aprobada previamente) → CompraYaDecididaError, sin tocar la tx', async () => {
    const c = makeCollaborators();
    c.ticketCompra.aprobar('otro-actor', new Date());

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraYaDecididaError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('ticket en estado terminal (CANCELADO) → TransicionInvalidaError (arco base no permite CANCELADO->CANCELADO)', async () => {
    const c = makeCollaborators();
    c.ticket.updateEstado('estado-cancelado-uuid');
    c.estadoRepo.findById.mockResolvedValue(c.estadoCancelado);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TransicionInvalidaError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });
});
