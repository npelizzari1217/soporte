import { DomainError, Result } from '../../../shared/domain/result';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { CompraNoEncontradaError } from '../../domain/errors/compras.errors';
import { ICompraRepository } from '../../domain/ports/i-compra.repository';
import { IInsumoRepository } from '../../../insumos/domain/ports/i-insumo.repository';
import { SeguimientoInsumo } from '../../../insumos/domain/entities/unidad-insumo.entity';

/** DTO de entrada de `ObtenerCompraUseCase`. */
export interface ObtenerCompraDto {
  compraId: string;
}

/**
 * El detalle más el seguimiento (`NINGUNO`/`SERIE`) de cada insumo que declaran sus ítems.
 * Un insumo inexistente o dado de baja no entra al mapa.
 */
export interface CompraConSeguimientos {
  compra: CompraEntity;
  seguimientoPorInsumo: ReadonlyMap<string, SeguimientoInsumo>;
}

/**
 * ObtenerCompraUseCase — detalle de una compra CON sus ítems (§4.9, H3).
 *
 * A diferencia de `ListarComprasUseCase` (S33: solo derivados, sin `items`),
 * este caso de uso es el de DETALLE: retorna la `CompraEntity` completa —
 * `items`/`estado`/`comprado`/`cerrado`/`totalesPorMoneda` los expone la
 * propia entidad, no hace falta proyectar un DTO nuevo (mismo criterio que
 * `ObtenerTicketUseCase`, que retorna la entidad directamente).
 *
 * `findByIdConItems` incluye compras soft-deleted por contrato de puerto
 * (ver JSDoc de `ICompraRepository`) — el filtro de "no visible" vive acá,
 * mismo patrón que `ObtenerTicketUseCase`: `CompraNoEncontradaError` tanto
 * si no existe como si está soft-deleted, sin distinguir el motivo (evita
 * revelar que existió una compra borrada a quien adivine el id).
 *
 * **Sin transacción, sin bitácora, deliberadamente** — es una consulta pura
 * (spec §4.10 reserva bitácora solo para mutaciones, S35). Ver el mismo
 * razonamiento en el JSDoc de `ListarComprasUseCase` sobre la regla
 * estructural "tx ⇒ bitácora" de ADR-C4.
 *
 * **Seguimiento de los insumos de los ítems.** Quien registra una recepción
 * (`COMPRAS:MODIFICACION`) necesita saber si el insumo se lleva por `SERIE` para pedir los
 * seriales, y no tiene por qué poder leer el stock del insumo (`INSUMOS:LECTURA`): el dato
 * viaja con el detalle, una lectura por insumo distinto (`findById`, sin lock).
 *
 * Alcance de tenant (S41): `findByIdConItems` ya está scopeado por
 * `TenantContext` en la implementación concreta — este caso de uso NO
 * recibe ni aplica un parámetro `clienteId`.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.9. Ref design: ADR-C1,
 * ADR-C2, ADR-C4. Ref tasks: PR-19, H3.
 */
export class ObtenerCompraUseCase {
  constructor(
    private readonly compraRepo: Pick<ICompraRepository, 'findByIdConItems'>,
    private readonly insumoRepo: Pick<IInsumoRepository, 'findById'>,
  ) {}

  async execute(dto: ObtenerCompraDto): Promise<Result<CompraConSeguimientos, DomainError>> {
    const compra = await this.compraRepo.findByIdConItems(dto.compraId);
    if (!compra || compra.isDeleted()) {
      return Result.fail(new CompraNoEncontradaError(dto.compraId));
    }

    const idsDeInsumo = new Set<string>();
    for (const item of compra.items) {
      if (!item.isDeleted() && item.insumoId !== null) idsDeInsumo.add(item.insumoId);
    }
    const seguimientoPorInsumo = new Map<string, SeguimientoInsumo>();
    for (const insumoId of idsDeInsumo) {
      const insumo = await this.insumoRepo.findById(insumoId);
      if (insumo && !insumo.isDeleted()) seguimientoPorInsumo.set(insumoId, insumo.seguimiento);
    }
    return Result.ok({ compra, seguimientoPorInsumo });
  }
}
