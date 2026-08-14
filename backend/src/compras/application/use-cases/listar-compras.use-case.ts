import { DomainError, Result } from '../../../shared/domain/result';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { EstadoCompra } from '../../domain/services/estado-compra';
import { CompraListFiltros, ICompraRepository } from '../../domain/ports/i-compra.repository';

const PAGINA_DEFAULT = 1;
const POR_PAGINA_DEFAULT = 20;

/** DTO de entrada de `ListarComprasUseCase`. Sin filtros de negocio (spec §4.9 no los pide) — solo paginación. */
export interface ListarComprasDto {
  /** Página 1-indexed. Default 1. */
  pagina?: number;
  /** Tamaño de página. Default 20. */
  porPagina?: number;
}

/**
 * Fila del listado (S33): SOLO los derivados de cabecera, NUNCA `items` — el
 * listado no arrastra el detalle. Los cuatro campos derivados
 * (`estado`/`comprado`/`cerrado`/`totalesPorMoneda`) vienen tal cual de los
 * getters de `CompraEntity`, que a su vez delegan en `derivarEstadoCompra`
 * (ADR-C1) — este DTO es una proyección, no una segunda fuente de verdad.
 */
export interface CompraListItemDto {
  id: string;
  numero: string;
  fechaSolicitud: Date;
  motivo: string;
  estado: EstadoCompra;
  comprado: boolean;
  cerrado: boolean;
  totalesPorMoneda: Record<string, number>;
}

/**
 * Resultado paginado de `ListarComprasUseCase`. `total` es el universo
 * filtrado completo (vía `ICompraRepository.count()`), NO el tamaño de la
 * página actual — sigue siendo correcto incluso cuando `items` viene vacío
 * (offset más allá del total).
 */
export interface ListarComprasResult {
  items: CompraListItemDto[];
  total: number;
  pagina: number;
  porPagina: number;
}

/**
 * ListarComprasUseCase — listado paginado de compras del tenant activo
 * (§4.9, S32-S34; hueco H3 del design, cubierto en PR-19).
 *
 * **Sin transacción, sin bitácora, deliberadamente** — es una consulta pura
 * (spec §4.10/§4.11 solo reservan bitácora para mutaciones, S35). Inyectar
 * `ITenantTransactionRunner` acá obligaría a este caso de uso a declarar
 * `RegistrarOperacionCompra` en `compras.module.ts` para satisfacer la regla
 * estructural "tx ⇒ bitácora" de ADR-C4/PR-22 — degradaría el predicado que
 * hace detectable en compilación el olvido de bitácora en un mutador nuevo.
 *
 * Dos métodos de lectura del puerto, en paralelo (`Promise.all`):
 * `findAllConItems` (la página) y `count` (el total del filtro completo,
 * IGNORANDO `limit`/`offset`) — mismo patrón que `ListarTicketsUseCase`
 * (T7). `count()` es una 3ª sentencia SQL fija y aislada, EXCEPCIÓN
 * DOCUMENTADA a S32 (ver JSDoc de `ICompraRepository.count`): el límite de
 * 2 se fijó contra el N+1 (consulta POR FILA), y un `count()` es O(1) — no
 * crece con la página ni con los ítems. La prohibición del N+1 sigue
 * vigente sin excepciones; solo se admite este tercer round-trip fijo.
 *
 * Alcance de tenant (S41): tanto `findAllConItems` como `count` ya están
 * scopeados por `TenantContext` en la implementación concreta (PR-11/PR-12)
 * — este caso de uso NO recibe ni aplica un parámetro `clienteId`.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.9 (S32, S33, S34). Ref
 * design: ADR-C1, ADR-C2, ADR-C4. Ref tasks: PR-19, H3, R17; excepción de
 * `total` cerrada en `sdd/redisenio-modulo-compras/count-en-consulta`.
 */
export class ListarComprasUseCase {
  constructor(private readonly compraRepo: Pick<ICompraRepository, 'findAllConItems' | 'count'>) {}

  async execute(dto: ListarComprasDto = {}): Promise<Result<ListarComprasResult, DomainError>> {
    const pagina = dto.pagina ?? PAGINA_DEFAULT;
    const porPagina = dto.porPagina ?? POR_PAGINA_DEFAULT;

    const filtrosPagina: CompraListFiltros = {
      limit: porPagina,
      offset: (pagina - 1) * porPagina,
    };
    // `count()` SIN limit/offset: mide el universo filtrado completo, no la
    // página — así el total sigue siendo correcto incluso cuando la página
    // pedida devuelve cero filas (offset más allá del total).
    const [compras, total] = await Promise.all([
      this.compraRepo.findAllConItems(filtrosPagina),
      this.compraRepo.count(),
    ]);

    return Result.ok({
      items: compras.map(ListarComprasUseCase.aFilaListado),
      total,
      pagina,
      porPagina,
    });
  }

  /** Proyecta una `CompraEntity` a la fila del listado (S33) — nunca incluye `items`. */
  private static aFilaListado(compra: CompraEntity): CompraListItemDto {
    return {
      id: compra.id,
      numero: compra.numero,
      fechaSolicitud: compra.fechaSolicitud,
      motivo: compra.motivo,
      estado: compra.estado,
      comprado: compra.comprado,
      cerrado: compra.cerrado,
      totalesPorMoneda: compra.totalesPorMoneda,
    };
  }
}
