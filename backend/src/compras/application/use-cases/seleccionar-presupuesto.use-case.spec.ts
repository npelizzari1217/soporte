/**
 * T4.4/T4.5 [UNIT] — RED→GREEN: `SeleccionarPresupuestoUseCase` (ADR-7).
 *
 * Garantiza la invariante "un solo presupuesto seleccionado por
 * ticket_compra" mediante swap atómico DENTRO de la transacción: si A ya
 * estaba seleccionado y se selecciona B, A queda `seleccionado=false` y B
 * `seleccionado=true`. Sin constraint de DB — solo el use case.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C3. Ref design: ADR-7.
 * Tarea: T4.4, T4.5.
 */
import {
  SeleccionarPresupuestoUseCase,
  SeleccionarPresupuestoDto,
} from './seleccionar-presupuesto.use-case';
import { PresupuestoEntity } from '../../domain/entities/presupuesto.entity';
import { PresupuestoNoEncontradoError } from '../../domain/errors/compras.errors';

function makePresupuesto(overrides: {
  id: string;
  ticketCompraId: string;
  seleccionado: boolean;
}): PresupuestoEntity {
  return PresupuestoEntity.create(
    {
      ticketCompraId: overrides.ticketCompraId,
      proveedor: 'Proveedor',
      montoTotal: 1000,
      moneda: 'ARS',
      fechaCotizacion: new Date('2026-01-01'),
      seleccionado: overrides.seleccionado,
      observaciones: null,
    },
    overrides.id,
  ).getValue();
}

describe('SeleccionarPresupuestoUseCase', () => {
  function makeCollaborators() {
    const presupuestoA = makePresupuesto({
      id: 'presupuesto-a',
      ticketCompraId: 'ticket-compra-uuid',
      seleccionado: true,
    });
    const presupuestoB = makePresupuesto({
      id: 'presupuesto-b',
      ticketCompraId: 'ticket-compra-uuid',
      seleccionado: false,
    });

    const presupuestoRepo = {
      findById: vi.fn().mockResolvedValue(presupuestoB),
      findSelectedByTicketCompraId: vi.fn().mockResolvedValue(presupuestoA),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new SeleccionarPresupuestoUseCase(presupuestoRepo as never, txRunner as never);
    return { useCase, presupuestoA, presupuestoB, presupuestoRepo, txRunner };
  }

  function baseDto(overrides: Partial<SeleccionarPresupuestoDto> = {}): SeleccionarPresupuestoDto {
    return { presupuestoId: 'presupuesto-b', ticketCompraId: 'ticket-compra-uuid', ...overrides };
  }

  it('ADR-7: swap atomico — A queda false, B queda true, ambos persistidos en la tx', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    expect(result.getValue().seleccionado).toBe(true);
    expect(c.presupuestoA.seleccionado).toBe(false);
    expect(c.presupuestoB.seleccionado).toBe(true);
    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.presupuestoRepo.save).toHaveBeenCalledWith(c.presupuestoA);
    expect(c.presupuestoRepo.save).toHaveBeenCalledWith(c.presupuestoB);
  });

  it('sin presupuesto anterior seleccionado — solo persiste el nuevo', async () => {
    const c = makeCollaborators();
    c.presupuestoRepo.findSelectedByTicketCompraId.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isOk()).toBe(true);
    expect(c.presupuestoRepo.save).toHaveBeenCalledTimes(1);
    expect(c.presupuestoRepo.save).toHaveBeenCalledWith(c.presupuestoB);
  });

  it('seleccionar el mismo presupuesto ya seleccionado — no duplica el save del "anterior"', async () => {
    const c = makeCollaborators();
    c.presupuestoRepo.findById.mockResolvedValue(c.presupuestoA);
    c.presupuestoRepo.findSelectedByTicketCompraId.mockResolvedValue(c.presupuestoA);

    const result = await c.useCase.execute(baseDto({ presupuestoId: 'presupuesto-a' }));

    expect(result.isOk()).toBe(true);
    expect(c.presupuestoRepo.save).toHaveBeenCalledTimes(1);
  });

  it('presupuesto inexistente → PresupuestoNoEncontradoError', async () => {
    const c = makeCollaborators();
    c.presupuestoRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PresupuestoNoEncontradoError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('presupuesto de OTRO ticket_compra → PresupuestoNoEncontradoError (no revela existencia)', async () => {
    const c = makeCollaborators();
    const deOtroTicket = makePresupuesto({
      id: 'presupuesto-b',
      ticketCompraId: 'otro-ticket-compra',
      seleccionado: false,
    });
    c.presupuestoRepo.findById.mockResolvedValue(deOtroTicket);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PresupuestoNoEncontradoError);
  });
});
