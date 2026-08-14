import { DomainError, Result } from '../../../shared/domain/result';
import { CompraNoEncontradaError } from '../../domain/errors/compras.errors';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import {
  IOperacionCompraRepository,
  OperacionCompra,
} from '../../domain/ports/i-operacion-compra.repository';

/** DTO de entrada de `ListarOperacionesCompraUseCase`. */
export interface ListarOperacionesCompraDto {
  compraId: string;
}

/**
 * ListarOperacionesCompraUseCase — bitácora completa de una compra (§4.10,
 * S37, H3).
 *
 * Flujo:
 * 1. Verifica que la compra exista y sea visible (mismo criterio que
 *    `ObtenerCompraUseCase`: no existe o soft-deleted -> `CompraNoEncontradaError`,
 *    fail-fast ANTES de tocar la bitácora — 0 llamadas a `listarPorCompra`).
 * 2. Delega en `IOperacionCompraRepository.listarPorCompra` — el ÚNICO
 *    método de lectura que ese puerto expone (S37: append-only garantizado
 *    por la FIRMA del puerto, sin `update`/`delete`). Este caso de uso no
 *    filtra ni reordena: la implementación concreta ya retorna la bitácora
 *    ordenada `created_at ASC` (ver JSDoc del puerto).
 *
 * **Sin transacción, sin bitácora propia, deliberadamente** — es una
 * consulta pura que LEE la bitácora, nunca escribe en ella (spec §4.10
 * reserva la escritura para `RegistrarOperacionCompra`, siempre dentro de la
 * transacción de una mutación, S35/S36). Ver el mismo razonamiento en el
 * JSDoc de `ListarComprasUseCase` sobre la regla estructural "tx ⇒
 * bitácora" de ADR-C4: inyectar `ITenantTransactionRunner` acá degradaría
 * ese predicado.
 *
 * Alcance de tenant (S41): ambos repos ya están scopeados por
 * `TenantContext` en la implementación concreta — este caso de uso NO
 * recibe ni aplica un parámetro `clienteId`.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.10 (S35-S37). Ref design:
 * ADR-C2, ADR-C4. Ref tasks: PR-19, H3.
 */
export class ListarOperacionesCompraUseCase {
  constructor(
    private readonly compraRepo: Pick<ICompraRepository, 'findByIdConItems'>,
    private readonly operacionRepo: Pick<IOperacionCompraRepository, 'listarPorCompra'>,
  ) {}

  async execute(dto: ListarOperacionesCompraDto): Promise<Result<OperacionCompra[], DomainError>> {
    const compra = await this.compraRepo.findByIdConItems(dto.compraId);
    if (!compra || compra.isDeleted()) {
      return Result.fail(new CompraNoEncontradaError(dto.compraId));
    }

    const operaciones = await this.operacionRepo.listarPorCompra(dto.compraId);
    return Result.ok(operaciones);
  }
}
