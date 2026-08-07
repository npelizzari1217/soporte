/**
 * T4.3 [UNIT] — RED→GREEN: `AgregarItemCompraUseCase`.
 *
 * Puertos mockeados — sin DB. Valida que el `ticket_compra` exista (no
 * soft-deleted) antes de crear el ítem (delegando `cantidad > 0` a
 * `ItemCompraEntity.create`, F3-C2).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C2. Tarea: T4.3.
 */
import { AgregarItemCompraUseCase, AgregarItemCompraDto } from './agregar-item-compra.use-case';
import { TicketCompraEntity } from '../../domain/entities/ticket-compra.entity';
import { CompraNoEncontradaError, CantidadInvalidaError } from '../../domain/errors/compras.errors';

function baseDto(overrides: Partial<AgregarItemCompraDto> = {}): AgregarItemCompraDto {
  return {
    ticketCompraId: 'ticket-compra-uuid',
    descripcion: 'Notebook 15"',
    cantidad: 2,
    unidad: 'unidad',
    precioUnitarioRef: 150000,
    ...overrides,
  };
}

describe('AgregarItemCompraUseCase', () => {
  function makeCollaborators() {
    const ticketCompraRepo = {
      findById: vi
        .fn()
        .mockResolvedValue(
          TicketCompraEntity.create({ ticketId: 'ticket-uuid' }, 'ticket-compra-uuid'),
        ),
    };
    const itemCompraRepo = { save: vi.fn().mockResolvedValue(undefined) };

    const useCase = new AgregarItemCompraUseCase(
      ticketCompraRepo as never,
      itemCompraRepo as never,
    );
    return { useCase, ticketCompraRepo, itemCompraRepo };
  }

  it('F3-C2: agrega el item y lo persiste', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    const item = result.getValue();
    expect(item.ticketCompraId).toBe('ticket-compra-uuid');
    expect(item.cantidad).toBe(2);
    expect(c.itemCompraRepo.save).toHaveBeenCalledWith(item);
  });

  it('ticket_compra inexistente → CompraNoEncontradaError, sin persistir', async () => {
    const c = makeCollaborators();
    c.ticketCompraRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
    expect(c.itemCompraRepo.save).not.toHaveBeenCalled();
  });

  it('ticket_compra soft-deleted se trata como inexistente', async () => {
    const c = makeCollaborators();
    const borrado = TicketCompraEntity.create({ ticketId: 'ticket-uuid' }, 'ticket-compra-uuid');
    borrado.softDelete();
    c.ticketCompraRepo.findById.mockResolvedValue(borrado);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
  });

  it('cantidad <= 0 → CantidadInvalidaError, sin persistir', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute(baseDto({ cantidad: 0 }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CantidadInvalidaError);
    expect(c.itemCompraRepo.save).not.toHaveBeenCalled();
  });
});
