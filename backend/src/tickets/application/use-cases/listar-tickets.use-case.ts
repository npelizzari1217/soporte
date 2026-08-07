import { DomainError, Result } from '../../../shared/domain/result';
import { MODULO_A_TIPO_CODIGO } from '../../../shared/domain/modulos';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { ITicketRepository, TicketFiltros } from '../../domain/ports/i-ticket.repository';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';

const PAGINA_DEFAULT = 1;
const POR_PAGINA_DEFAULT = 20;

/**
 * DTO de entrada de `ListarTicketsUseCase`.
 *
 * `filtros` excluye `soloSolicitante`/`limit`/`offset` — esos tres los
 * calcula el use case (scope de rol T6/T7 y paginación), nunca el caller.
 */
export interface ListarTicketsDto {
  filtros?: Omit<TicketFiltros, 'soloSolicitante' | 'limit' | 'offset'>;
  actorId: string;
  tienePermisoVerTodos: boolean;
  /** Página 1-indexed. Default 1. */
  pagina?: number;
  /** Tamaño de página. Default 20. */
  porPagina?: number;
  /**
   * Módulos funcionales asignados al usuario para restringir los tipos de
   * ticket visibles (feature 5.2 CAPA 2). `null` = SIN restricción de módulo
   * (ROOT/ADMINISTRADOR — ven todos los tipos, incluidos los custom del
   * tenant). El controller resuelve este valor: nunca es el caller HTTP.
   */
  modulosPermitidos?: string[] | null;
}

/** Resultado paginado de `ListarTicketsUseCase`. */
export interface ListarTicketsResult {
  items: TicketEntity[];
  total: number;
  pagina: number;
  porPagina: number;
}

/**
 * ListarTicketsUseCase — listado de tickets del tenant con filtros
 * combinables, scope por rol y ciclo efectivo (T7).
 *
 * - Ciclo efectivo: `filtros.cicloId` explícito (histórico) tiene prioridad;
 *   si no viene, se resuelve el ciclo ACTIVO del tenant. Sin cicloId
 *   explícito NI activo → `{ items: [], total: 0 }` (invariante "siempre
 *   por ciclo", nunca "todos").
 * - Scope de rol (T6): sin `ticket:ver_todos` se deriva
 *   `soloSolicitante = actorId`; con el permiso, `soloSolicitante`
 *   queda `undefined` (ve todos).
 * - Paginación (PR6): `pagina`/`porPagina` se traducen a `limit`/`offset`.
 *   `count()` se consulta con los MISMOS filtros pero SIN paginación, para
 *   que `total` refleje el universo completo, no la página actual.
 * - Gate de módulo (5.2 CAPA 2): si `dto.modulosPermitidos !== null`, se
 *   traducen los módulos a códigos de tipo (`MODULO_A_TIPO_CODIGO`,
 *   descartando los que no mapean como EQUIPOS), se resuelven esos códigos a
 *   los `tipoId` del tenant y se INTERSECTAN con `filtros.tiposIds` (nunca se
 *   permite ver un tipo fuera de los módulos del usuario). Conjunto permitido
 *   vacío → `{ items: [], total: 0 }`. `null` = sin restricción
 *   (ROOT/ADMINISTRADOR).
 *
 * Ref spec: sdd/tickets-core/spec T6, T7. Tarea: T6.4.
 */
export class ListarTicketsUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly cicloClienteRepo: ICicloClienteRepository,
    private readonly tipoTicketRepo: ITipoTicketRepository,
  ) {}

  async execute(dto: ListarTicketsDto): Promise<Result<ListarTicketsResult, DomainError>> {
    const pagina = dto.pagina ?? PAGINA_DEFAULT;
    const porPagina = dto.porPagina ?? POR_PAGINA_DEFAULT;

    // Gate de módulo (5.2 CAPA 2): resuelve los tipoId visibles según los
    // módulos del usuario ANTES de tocar el repo de tickets. `null` = sin
    // restricción (ROOT/ADMINISTRADOR). Conjunto vacío → corta con lista vacía.
    const tiposIdsPorModulo = await this.resolverTiposPorModulo(dto.modulosPermitidos);
    if (tiposIdsPorModulo !== null && tiposIdsPorModulo.length === 0) {
      return Result.ok({ items: [], total: 0, pagina, porPagina });
    }

    const cicloEfectivoId = dto.filtros?.cicloId ?? (await this.cicloClienteRepo.findActive())?.id;

    if (!cicloEfectivoId) {
      return Result.ok({ items: [], total: 0, pagina, porPagina });
    }

    // Intersección con el filtro `tiposIds` pedido por el caller: nunca se
    // amplía el scope de módulo. Sin filtro pedido → se usan los del módulo.
    const tiposIdsEfectivos = this.intersectarTipos(dto.filtros?.tiposIds, tiposIdsPorModulo);
    if (tiposIdsEfectivos !== undefined && tiposIdsEfectivos.length === 0) {
      return Result.ok({ items: [], total: 0, pagina, porPagina });
    }

    const soloSolicitante = dto.tienePermisoVerTodos ? undefined : dto.actorId;
    const filtrosBase: TicketFiltros = {
      ...dto.filtros,
      cicloId: cicloEfectivoId,
      soloSolicitante,
      tiposIds: tiposIdsEfectivos,
    };

    const [items, total] = await Promise.all([
      this.ticketRepo.findAll({
        ...filtrosBase,
        limit: porPagina,
        offset: (pagina - 1) * porPagina,
      }),
      this.ticketRepo.count(filtrosBase),
    ]);

    return Result.ok({ items, total, pagina, porPagina });
  }

  /**
   * Traduce los módulos permitidos del usuario a los `tipoId` de tipos de
   * ticket visibles en el tenant. `null` (sin restricción) → devuelve `null`.
   * Los módulos que no mapean a un tipo (EQUIPOS) o cuyos códigos no existen
   * en el tenant se descartan; el resultado puede ser un array vacío (usuario
   * sin ningún tipo visible).
   */
  private async resolverTiposPorModulo(
    modulosPermitidos: string[] | null | undefined,
  ): Promise<string[] | null> {
    if (modulosPermitidos === null || modulosPermitidos === undefined) {
      return null;
    }

    const codigos = modulosPermitidos
      .map((modulo) => MODULO_A_TIPO_CODIGO[modulo])
      .filter((codigo): codigo is string => codigo !== undefined);

    const idsResueltos = await Promise.all(
      codigos.map((codigo) => this.tipoTicketRepo.findIdByCodigo(codigo)),
    );

    return idsResueltos.filter((id): id is string => id !== null);
  }

  /**
   * Intersecta el filtro `tiposIds` pedido por el caller con los tipos
   * permitidos por módulo. `permitidosPorModulo === null` → no hay gate de
   * módulo, se respeta el filtro del caller tal cual (o `undefined` = todos).
   */
  private intersectarTipos(
    tiposIdsSolicitados: string[] | undefined,
    permitidosPorModulo: string[] | null,
  ): string[] | undefined {
    if (permitidosPorModulo === null) {
      return tiposIdsSolicitados;
    }
    if (tiposIdsSolicitados === undefined || tiposIdsSolicitados.length === 0) {
      return permitidosPorModulo;
    }
    return permitidosPorModulo.filter((id) => tiposIdsSolicitados.includes(id));
  }
}
