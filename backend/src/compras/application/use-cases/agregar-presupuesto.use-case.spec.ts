/**
 * T4.5 [UNIT] — RED→GREEN: `AgregarPresupuestoUseCase`.
 *
 * Crea un presupuesto con `seleccionado=false` (F3-C3) — la selección se
 * hace después vía `SeleccionarPresupuestoUseCase` (ADR-7).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C3. Tarea: T4.5.
 */
import { AgregarPresupuestoUseCase, AgregarPresupuestoDto } from './agregar-presupuesto.use-case';
import { TicketCompraEntity } from '../../domain/entities/ticket-compra.entity';
import { CompraNoEncontradaError, MonedaInvalidaError } from '../../domain/errors/compras.errors';

function baseDto(overrides: Partial<AgregarPresupuestoDto> = {}): AgregarPresupuestoDto {
  return {
    ticketCompraId: 'ticket-compra-uuid',
    proveedor: 'Proveedor SRL',
    montoTotal: 150000,
    moneda: 'ARS',
    fechaCotizacion: new Date('2026-01-15'),
    ...overrides,
  };
}

describe('AgregarPresupuestoUseCase', () => {
  function makeCollaborators() {
    const ticketCompraRepo = {
      findById: vi
        .fn()
        .mockResolvedValue(
          TicketCompraEntity.create({ ticketId: 'ticket-uuid' }, 'ticket-compra-uuid'),
        ),
    };
    const presupuestoRepo = { save: vi.fn().mockResolvedValue(undefined) };

    const useCase = new AgregarPresupuestoUseCase(
      ticketCompraRepo as never,
      presupuestoRepo as never,
    );
    return { useCase, ticketCompraRepo, presupuestoRepo };
  }

  it('F3-C3: crea el presupuesto con seleccionado=false y lo persiste', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    const presupuesto = result.getValue();
    expect(presupuesto.seleccionado).toBe(false);
    expect(presupuesto.proveedor).toBe('Proveedor SRL');
    expect(c.presupuestoRepo.save).toHaveBeenCalledWith(presupuesto);
  });

  it('ticket_compra inexistente → CompraNoEncontradaError', async () => {
    const c = makeCollaborators();
    c.ticketCompraRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
  });

  it('moneda invalida → MonedaInvalidaError, sin persistir', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute(baseDto({ moneda: 'PESOS' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(MonedaInvalidaError);
    expect(c.presupuestoRepo.save).not.toHaveBeenCalled();
  });
});
