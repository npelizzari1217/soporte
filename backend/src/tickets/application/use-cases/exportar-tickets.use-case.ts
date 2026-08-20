import { armarExportCsv } from '../../../shared/application/armar-export-csv';
import { DomainError, Result } from '../../../shared/domain/result';
import { TOPE_FILAS_EXPORT } from '../../../shared/domain/tope-filas-export';
import { ColumnaCsv, diaArgentinoCsv, fechaHoraCsv } from '../../../shared/infrastructure/csv/csv';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { ExportacionDemasiadoGrandeError } from '../../domain/errors/tickets.errors';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { IPrioridadRepository } from '../../domain/ports/i-prioridad.repository';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import { TicketFiltros } from '../../domain/ports/i-ticket.repository';
import { ListarTicketsUseCase } from './listar-tickets.use-case';

/**
 * Filtros de la exportación: los MISMOS del listado, menos `soloSolicitante`
 * (lo deriva `ListarTicketsUseCase` del actor, T7) y la paginación. La
 * ausencia de `pagina`/`porPagina` está en el TIPO, no en un comentario:
 * exportar la página visible en vez del universo filtrado es el error que
 * vuelve inútil a esta función.
 *
 * Ref: sdd/exportar-listados-csv/design, decisión D3.
 */
export interface ExportarTicketsDto {
  filtros?: Omit<TicketFiltros, 'soloSolicitante' | 'limit' | 'offset'>;
  /** JWT.sub del actor — `ListarTicketsUseCase` lo usa para derivar el scope de filas (T6/T7). */
  actorId: string;
  /** `TICKETS:VER_TODOS` del actor. `false` → el listado compuesto se restringe a sus propios tickets. */
  tienePermisoVerTodos: boolean;
  /** Gate de módulo (5.2 CAPA 2). `null`/`undefined` = sin restricción (ROOT/ADMINISTRADOR). */
  modulosPermitidos?: string[] | null;
}

/** Archivo listo para que el controller lo entregue como descarga. */
export interface ExportarTicketsResult {
  /** CSV completo, con BOM y encabezado. */
  contenido: string;
  /** Nombre sugerido, con la fecha de exportación en hora de Argentina (`tickets-2026-08-19.csv`). */
  nombreArchivo: string;
}

/**
 * ExportarTicketsUseCase — vuelca a CSV el listado de tickets del tenant
 * activo, con los mismos filtros que la pantalla (sdd/exportar-listados-csv).
 *
 * **Por qué compone `ListarTicketsUseCase` en vez de inyectar
 * `ITicketRepository`** (design D4): componer el listado YA RESUELTO es lo
 * que hace estructuralmente imposible entregar el tenant entero a un
 * requester sin `TICKETS:VER_TODOS` — el scope por fila (`soloSolicitante`),
 * el ciclo efectivo (T7) y el gate de módulo (5.2 CAPA 2) los resuelve
 * `ListarTicketsUseCase`, no este caso de uso. Una implementación con su
 * propio `ITicketRepository` tendría que reimplementar (y podría olvidar)
 * exactamente esa restricción — es el hallazgo de mayor valor de esta
 * exportación (threat matrix del design, "Authorization bypass on new
 * routes").
 *
 * **Por qué NO inyecta `ITipoTicketRepository`**: la desviación respecto al
 * design (D3 lista `tipoTicketRepo` en el constructor) es intencional — la
 * spec (capability `exportacion-tickets`) fija las columnas del CSV en
 * número/título/estado/prioridad/técnico asignado/fecha de creación/fecha de
 * cierre, SIN columna de tipo. Inyectar un repo cuya salida ninguna columna
 * lee sería dead weight; el gate de módulo (que SÍ usa `tipoTicketRepo`) ya
 * vive DENTRO del `ListarTicketsUseCase` compuesto.
 *
 * **Labels resueltos server-side, batcheados** (D3): un solo `Promise.all`
 * con `findAllActive()` de estados/prioridades + `resolverNombres(...)` para
 * el técnico asignado — 3 consultas constantes, sin importar cuántos tickets
 * exporte (nunca una consulta por fila).
 *
 * Consulta pura: sin transacción ni bitácora, mismo criterio que
 * `ExportarComprasUseCase`.
 */
export class ExportarTicketsUseCase {
  constructor(
    private readonly listarTicketsUseCase: ListarTicketsUseCase,
    private readonly estadoRepo: Pick<IEstadoRepository, 'findAllActive'>,
    private readonly prioridadRepo: Pick<IPrioridadRepository, 'findAllActive'>,
    private readonly usuarioMasterChecker: Pick<IUsuarioMasterChecker, 'resolverNombres'>,
  ) {}

  async execute(dto: ExportarTicketsDto): Promise<Result<ExportarTicketsResult, DomainError>> {
    // Fetch acotado: nunca más de TOPE_FILAS_EXPORT filas, sin importar cuántas
    // matchean el filtro — `total` (de `count()`, dentro del use case
    // compuesto) es la verdad sobre si el resultado entra o no.
    const listado = await this.listarTicketsUseCase.execute({
      actorId: dto.actorId,
      tienePermisoVerTodos: dto.tienePermisoVerTodos,
      modulosPermitidos: dto.modulosPermitidos,
      filtros: dto.filtros,
      pagina: 1,
      porPagina: TOPE_FILAS_EXPORT,
    });

    if (listado.isFail()) {
      return Result.fail(listado.getError());
    }

    const { items, total } = listado.getValue();

    const idsAsignados = [
      ...new Set(
        items.map((ticket) => ticket.asignadoId).filter((id): id is string => id !== null),
      ),
    ];

    const [estados, prioridades, nombresPorUsuario] = await Promise.all([
      this.estadoRepo.findAllActive(),
      this.prioridadRepo.findAllActive(),
      this.usuarioMasterChecker.resolverNombres(idsAsignados),
    ]);

    const nombrePorEstadoId = new Map(estados.map((estado) => [estado.id, estado.nombre]));
    const nombrePorPrioridadId = new Map(
      prioridades.map((prioridad) => [prioridad.id, prioridad.nombre]),
    );

    return armarExportCsv({
      filas: items,
      total,
      tope: TOPE_FILAS_EXPORT,
      columnas: ExportarTicketsUseCase.columnas(
        nombrePorEstadoId,
        nombrePorPrioridadId,
        nombresPorUsuario,
      ),
      prefijo: 'tickets',
      alExceder: (total, tope) => new ExportacionDemasiadoGrandeError(total, tope),
    });
  }

  /** Arma las columnas fijas del archivo — las lambdas SOLO leen de los mapas ya resueltos. */
  private static columnas(
    nombrePorEstadoId: ReadonlyMap<string, string>,
    nombrePorPrioridadId: ReadonlyMap<string, string>,
    nombresPorUsuario: ReadonlyMap<string, { nombre: string; apellido: string }>,
  ): readonly ColumnaCsv<TicketEntity>[] {
    return [
      { encabezado: 'Número', valor: (t) => t.numero },
      { encabezado: 'Título', valor: (t) => t.titulo },
      { encabezado: 'Estado', valor: (t) => nombrePorEstadoId.get(t.estadoId) ?? '' },
      { encabezado: 'Prioridad', valor: (t) => nombrePorPrioridadId.get(t.prioridadId) ?? '' },
      {
        encabezado: 'Técnico asignado',
        valor: (t) => {
          if (t.asignadoId === null) {
            return '';
          }
          const usuario = nombresPorUsuario.get(t.asignadoId);
          return usuario ? `${usuario.nombre} ${usuario.apellido}`.trim() : '';
        },
      },
      // `createdAt` y `fechaCierre` son ambas `@db.Timestamptz` (un instante
      // real; `fechaCierre` lo pasó a ser en sdd/corregir-fecha-cierre-tickets,
      // que además fijó por decisión de producto que esta columna sigue
      // mostrando SOLO el día argentino, no fecha+hora). `fechaHoraCsv`
      // desplaza y muestra fecha+hora; `diaArgentinoCsv` desplaza y trunca al
      // día. Usar `fechaCsv` acá (que NO desplaza, pensado para columnas
      // `@db.Date`) reintroduciría el bug de la ventana 21:00-23:59 ART.
      { encabezado: 'Fecha de creación', valor: (t) => fechaHoraCsv(t.createdAt) },
      { encabezado: 'Fecha de cierre', valor: (t) => diaArgentinoCsv(t.fechaCierre) },
    ];
  }
}
