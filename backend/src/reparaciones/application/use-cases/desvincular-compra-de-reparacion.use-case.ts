import { DomainError, Result } from '../../../shared/domain/result';
import { IReparacionCompraRepository } from '../../domain/ports/i-reparacion-compra.repository';
import { VinculoNoEncontradoError } from '../../domain/errors/reparaciones.errors';

/** DTO de entrada para desvincular una compra de una reparación. */
export interface DesvincularCompraDeReparacionDto {
  /** UUID del `ticket_edilicia` (la reparación) de la que se desvincula la compra. */
  ticketEdiliciaId: string;
  /** UUID de la compra a desvincular. */
  compraId: string;
}

/**
 * DesvincularCompraDeReparacionUseCase — elimina (HARD DELETE real, D5) el
 * vínculo entre una reparación y una compra (sdd/reparacion-bloqueada-por-compra,
 * WU5).
 *
 * Verifica existencia ANTES de borrar reusando
 * `findComprasVinculadasByTicketEdiliciaIds` (el ÚNICO método de lectura que
 * expone el puerto, WU1 — no se le agrega un `existeVinculo` nuevo: el
 * puerto no se toca en WU5) — `IReparacionCompraRepository.desvincular` hace
 * un `deleteMany` silencioso que no informa si borró algo, así que sin este
 * chequeo previo un vínculo inexistente respondería 204 en vez de 404.
 *
 * Sin throw para fallos esperados — se modela con `Result.fail()`.
 *
 * Ref design: sdd/reparacion-bloqueada-por-compra/design, D5. Ref tasks:
 * WU5.3, WU5.4.
 */
export class DesvincularCompraDeReparacionUseCase {
  constructor(
    private readonly reparacionCompraRepo: Pick<
      IReparacionCompraRepository,
      'findComprasVinculadasByTicketEdiliciaIds' | 'desvincular'
    >,
  ) {}

  async execute(dto: DesvincularCompraDeReparacionDto): Promise<Result<void, DomainError>> {
    const vinculadasPorReparacion =
      await this.reparacionCompraRepo.findComprasVinculadasByTicketEdiliciaIds([
        dto.ticketEdiliciaId,
      ]);
    const vinculadas = vinculadasPorReparacion.get(dto.ticketEdiliciaId) ?? [];
    const existeVinculo = vinculadas.some((compra) => compra.compraId === dto.compraId);

    if (!existeVinculo) {
      return Result.fail(new VinculoNoEncontradoError(dto.ticketEdiliciaId, dto.compraId));
    }

    await this.reparacionCompraRepo.desvincular(dto.ticketEdiliciaId, dto.compraId);

    return Result.ok(undefined);
  }
}
