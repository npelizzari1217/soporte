import { DomainError, Result } from '../../../shared/domain/result';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { EstadoCompra, FiltroGrupoEstadoCompra } from '../../domain/services/estado-compra';
import { CompraListFiltros, ICompraRepository } from '../../domain/ports/i-compra.repository';

const PAGINA_DEFAULT = 1;
const POR_PAGINA_DEFAULT = 20;
const GRUPO_ESTADO_DEFAULT: FiltroGrupoEstadoCompra = 'ACTIVAS';

/**
 * DTO de entrada de `ListarComprasUseCase`. WU-11/WU-13 (R7, R9) agregan los
 * filtros de negocio; el default del filtro de estado se resuelve ACÁ, no en
 * el puerto (`CompraListFiltros.grupoEstado` queda `undefined` si el caller
 * no lo especifica).
 */
export interface ListarComprasDto {
  /** Página 1-indexed. Default 1. */
  pagina?: number;
  /** Tamaño de página. Default 20. */
  porPagina?: number;
  /** Filtro por ciclo (R7). `undefined` = sin restricción. */
  cicloId?: string;
  /**
   * Grupo de estado a listar (WU-25). Default `ACTIVAS`. Tiene PRECEDENCIA
   * sobre `soloEnCurso` — ver `resolverGrupoEstado`.
   */
  estado?: FiltroGrupoEstadoCompra;
  /**
   * @deprecated WU-25 — usar `estado`. Se sigue aceptando por
   * retrocompatibilidad: `false` equivale a `TODAS` y `true` a `ACTIVAS`.
   * Se IGNORA cuando `estado` viene presente.
   */
  soloEnCurso?: boolean;
  /** Filtro por sector de cabecera (R11). */
  sectorId?: string;
  /** Filtra por `fechaSolicitud >= fechaDesde` (R7, fecha de CABECERA). */
  fechaDesde?: Date;
  /** Filtra por `fechaSolicitud <= fechaHasta` (R7, fecha de CABECERA). */
  fechaHasta?: Date;
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
 * filtrado completo (viene de la misma consulta que `items`, ver
 * `ICompraRepository.findPaginaConItems`), NO el tamaño de la página actual
 * — sigue siendo correcto incluso cuando `items` viene vacío (offset más
 * allá del total).
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
 * Un solo método de lectura del puerto: `findPaginaConItems` devuelve la
 * página YA ORDENADA y el `total` del universo filtrado en la MISMA
 * consulta (WU-25). Antes eran dos (`findAllConItems` + `count`) y S62
 * existía para vigilar que ambas recibieran el mismo filtro; ahora esa
 * desincronización es imposible por construcción. El presupuesto de
 * sentencias SQL sigue siendo 3 (ver JSDoc del puerto).
 *
 * Alcance de tenant (S41): `findPaginaConItems` ya está scopeado por
 * `TenantContext` en la implementación concreta (PR-11/PR-12) — este caso
 * de uso NO recibe ni aplica un parámetro `clienteId`.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.9 (S32, S33, S34). Ref
 * design: ADR-C1, ADR-C2, ADR-C4. Ref tasks: PR-19, H3, R17; WU-25
 * (sdd/compras-orden-filtro-estado).
 */
export class ListarComprasUseCase {
  constructor(private readonly compraRepo: Pick<ICompraRepository, 'findPaginaConItems'>) {}

  /**
   * Resuelve el grupo de estado a filtrar a partir de los dos parámetros
   * aceptados. Tabla de precedencia (WU-25):
   *
   * | `estado`   | `soloEnCurso` | resultado |
   * |------------|---------------|-----------|
   * | presente   | cualquiera    | `estado` (gana; `soloEnCurso` se ignora) |
   * | ausente    | `true`        | `ACTIVAS` |
   * | ausente    | `false`       | `TODAS`   |
   * | ausente    | ausente       | `ACTIVAS` (default) |
   *
   * `estado` gana porque es el parámetro expresivo: `soloEnCurso` es un
   * booleano que sólo puede expresar dos de los cuatro valores, así que
   * dejarlo pisar a `estado` degradaría una petición explícita.
   */
  private static resolverGrupoEstado(dto: ListarComprasDto): FiltroGrupoEstadoCompra {
    if (dto.estado !== undefined) {
      return dto.estado;
    }
    if (dto.soloEnCurso !== undefined) {
      return dto.soloEnCurso ? 'ACTIVAS' : 'TODAS';
    }
    return GRUPO_ESTADO_DEFAULT;
  }

  async execute(dto: ListarComprasDto = {}): Promise<Result<ListarComprasResult, DomainError>> {
    const pagina = dto.pagina ?? PAGINA_DEFAULT;
    const porPagina = dto.porPagina ?? POR_PAGINA_DEFAULT;

    const filtros: CompraListFiltros = {
      ...(dto.cicloId !== undefined && { cicloId: dto.cicloId }),
      grupoEstado: ListarComprasUseCase.resolverGrupoEstado(dto),
      ...(dto.sectorId !== undefined && { sectorId: dto.sectorId }),
      ...(dto.fechaDesde !== undefined && { fechaDesde: dto.fechaDesde }),
      ...(dto.fechaHasta !== undefined && { fechaHasta: dto.fechaHasta }),
      limit: porPagina,
      offset: (pagina - 1) * porPagina,
    };
    const { compras, total } = await this.compraRepo.findPaginaConItems(filtros);

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
