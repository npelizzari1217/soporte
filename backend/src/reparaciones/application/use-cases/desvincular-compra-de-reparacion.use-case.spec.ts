/**
 * WU5.3 [UNIT][RED] — `DesvincularCompraDeReparacionUseCase`.
 *
 * Desvinculación exitosa (hard delete real, D5), 404 con vínculo inexistente.
 *
 * Ref design: sdd/reparacion-bloqueada-por-compra/design, D5. Ref tasks:
 * WU5.3, WU5.4.
 */
import { DesvincularCompraDeReparacionUseCase } from './desvincular-compra-de-reparacion.use-case';
import { VinculoNoEncontradoError } from '../../domain/errors/reparaciones.errors';

describe('DesvincularCompraDeReparacionUseCase', () => {
  function buildDeps() {
    const reparacionCompraRepo = {
      findComprasVinculadasByTicketEdiliciaIds: vi.fn(),
      desvincular: vi.fn().mockResolvedValue(undefined),
    };

    const useCase = new DesvincularCompraDeReparacionUseCase(reparacionCompraRepo as any);

    return { useCase, reparacionCompraRepo };
  }

  const baseDto = { ticketEdiliciaId: 'edilicia-uuid', compraId: 'compra-uuid' };

  it('desvincula (hard delete real) cuando el vínculo existe', async () => {
    const { useCase, reparacionCompraRepo } = buildDeps();
    reparacionCompraRepo.findComprasVinculadasByTicketEdiliciaIds.mockResolvedValue(
      new Map([['edilicia-uuid', [{ compraId: 'compra-uuid', numero: 'COM-2026-00001' }]]]),
    );

    const result = await useCase.execute(baseDto);

    expect(result.isOk()).toBe(true);
    expect(reparacionCompraRepo.desvincular).toHaveBeenCalledWith('edilicia-uuid', 'compra-uuid');
  });

  it('rechaza con 404 cuando el vínculo no existe', async () => {
    const { useCase, reparacionCompraRepo } = buildDeps();
    reparacionCompraRepo.findComprasVinculadasByTicketEdiliciaIds.mockResolvedValue(new Map());

    const result = await useCase.execute(baseDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(VinculoNoEncontradoError);
    expect(reparacionCompraRepo.desvincular).not.toHaveBeenCalled();
  });

  it('rechaza con 404 cuando la reparación tiene otras compras vinculadas pero no esta', async () => {
    const { useCase, reparacionCompraRepo } = buildDeps();
    reparacionCompraRepo.findComprasVinculadasByTicketEdiliciaIds.mockResolvedValue(
      new Map([['edilicia-uuid', [{ compraId: 'otra-compra-uuid', numero: 'COM-2026-00002' }]]]),
    );

    const result = await useCase.execute(baseDto);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(VinculoNoEncontradoError);
    expect(reparacionCompraRepo.desvincular).not.toHaveBeenCalled();
  });
});
