/**
 * WU5.1 [UNIT][RED] — `VincularCompraAReparacionUseCase`.
 *
 * Vinculación exitosa, idempotencia (D4: doble vinculación no crea una
 * segunda fila ni altera la derivación), 404 por reparación inexistente,
 * 404 por compra inexistente.
 *
 * Ref design: sdd/reparacion-bloqueada-por-compra/design, D4, D7. Ref tasks:
 * WU5.1, WU5.2.
 */
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { VincularCompraAReparacionUseCase } from './vincular-compra-a-reparacion.use-case';
import {
  TicketEdiliciaNoEncontradoError,
  CompraNoEncontradaError,
} from '../../domain/errors/reparaciones.errors';

describe('VincularCompraAReparacionUseCase', () => {
  function buildDeps() {
    const ticketEdiliciaRepo = { findById: vi.fn() };
    const compraRepo = { findByIdConItems: vi.fn() };
    const reparacionCompraRepo = { vincular: vi.fn().mockResolvedValue(undefined) };

    const useCase = new VincularCompraAReparacionUseCase(
      ticketEdiliciaRepo as any,
      compraRepo as any,
      reparacionCompraRepo as any,
    );

    return { useCase, ticketEdiliciaRepo, compraRepo, reparacionCompraRepo };
  }

  const baseDto = { ticketEdiliciaId: 'edilicia-uuid', compraId: 'compra-uuid' };

  it('vincula la compra a la reparación cuando ambas existen', async () => {
    const { useCase, ticketEdiliciaRepo, compraRepo, reparacionCompraRepo } = buildDeps();
    const edilicia = TicketEdiliciaEntity.create(
      { ticketId: 'ticket-uuid', ubicacion: 'Edificio Central' },
      'edilicia-uuid',
    );
    ticketEdiliciaRepo.findById.mockResolvedValue(edilicia);
    compraRepo.findByIdConItems.mockResolvedValue({ id: 'compra-uuid' });

    const result = await useCase.execute(baseDto);

    expect(result.isOk()).toBe(true);
    expect(reparacionCompraRepo.vincular).toHaveBeenCalledWith('edilicia-uuid', 'compra-uuid');
  });

  it('es idempotente: vincular el mismo par dos veces no falla y delega en el puerto las dos veces', async () => {
    const { useCase, ticketEdiliciaRepo, compraRepo, reparacionCompraRepo } = buildDeps();
    const edilicia = TicketEdiliciaEntity.create(
      { ticketId: 'ticket-uuid', ubicacion: 'Edificio Central' },
      'edilicia-uuid',
    );
    ticketEdiliciaRepo.findById.mockResolvedValue(edilicia);
    compraRepo.findByIdConItems.mockResolvedValue({ id: 'compra-uuid' });

    const primero = await useCase.execute(baseDto);
    const segundo = await useCase.execute(baseDto);

    expect(primero.isOk()).toBe(true);
    expect(segundo.isOk()).toBe(true);
    // La idempotencia real (UNIQUE + ON CONFLICT DO NOTHING) vive en el
    // repositorio (WU2) — acá solo se verifica que el caso de uso delega
    // sin lógica de "check-then-insert" propia.
    expect(reparacionCompraRepo.vincular).toHaveBeenCalledTimes(2);
  });

  it('rechaza con 404 cuando la reparación no existe', async () => {
    const { useCase, ticketEdiliciaRepo, compraRepo, reparacionCompraRepo } = buildDeps();
    ticketEdiliciaRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute(baseDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketEdiliciaNoEncontradoError);
    expect(compraRepo.findByIdConItems).not.toHaveBeenCalled();
    expect(reparacionCompraRepo.vincular).not.toHaveBeenCalled();
  });

  it('rechaza con 404 cuando la compra no existe', async () => {
    const { useCase, ticketEdiliciaRepo, compraRepo, reparacionCompraRepo } = buildDeps();
    const edilicia = TicketEdiliciaEntity.create(
      { ticketId: 'ticket-uuid', ubicacion: 'Edificio Central' },
      'edilicia-uuid',
    );
    ticketEdiliciaRepo.findById.mockResolvedValue(edilicia);
    compraRepo.findByIdConItems.mockResolvedValue(null);

    const result = await useCase.execute(baseDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CompraNoEncontradaError);
    expect(reparacionCompraRepo.vincular).not.toHaveBeenCalled();
  });
});
