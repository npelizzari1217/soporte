import {
  ArchivoExport,
  ArchivoExportDe,
  armarExport,
  FormatoExport,
} from '../../../shared/application/armar-export';
import { DomainError, Result } from '../../../shared/domain/result';
import { TOPE_FILAS_EXPORT } from '../../../shared/domain/tope-filas-export';
import { ColumnaCsv } from '../../../shared/infrastructure/csv/csv';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { ExportacionDemasiadoGrandeError } from '../../domain/errors/equipos.errors';
import { ListarEquiposDto, ListarEquiposUseCase } from './listar-equipos.use-case';

/** Archivo listo para que el controller lo entregue como descarga (CSV como texto, xlsx como Buffer). */
export type ExportarEquiposResult = ArchivoExport;

/**
 * ExportarEquiposUseCase — vuelca a CSV el inventario de equipos IT del tenant
 * (sdd/exportar-listados-csv, capability exportacion-equipos).
 *
 * **Un único parámetro: `incluirDadosDeBaja`** (R11, sdd/baja-equipo-completo). La
 * exportación sigue el mismo filtro que la lista: por defecto solo los equipos vigentes y,
 * con `incluirDadosDeBaja`, también los dados de baja, con "Baja" en la columna Estado. No
 * hay ningún otro filtro porque la pantalla no tiene otros que espejar (a diferencia de
 * `ExportarTicketsUseCase`). Se delega tal cual a `ListarEquiposUseCase`, así lista y
 * exportación no pueden divergir.
 *
 * **Por qué compone `ListarEquiposUseCase` en vez de inyectar
 * `IEquipoInformaticoRepository`** (design D4): con un solo argumento en el
 * constructor no hay NADA que consultar por fila — el tipo lo hace
 * estructuralmente imposible, no es una convención que se pueda romper. El
 * scoping por tenant lo resuelve el repositorio Prisma vía `TenantContext`,
 * heredado sin agregar ninguna consulta nueva.
 *
 * **Por qué el tope se chequea DESPUÉS de traer todo** (design D4, threat
 * "Unbounded memory", residual aceptado): la consulta no tiene un
 * `count()` en el puerto, y agregarle uno sería un cambio de firma de puerto
 * (prohibido en este cambio). `total` es por lo tanto `items.length`, no el
 * resultado de una consulta de conteo real. Esto NO es una regresión: el
 * listado en pantalla (`GET /equipos`) ya materializa exactamente el mismo
 * conjunto hoy — la exportación no le agrega memoria al servidor que el
 * listado no le agregara ya. Lo que el tope protege acá es al USUARIO (no
 * recibir un archivo inutilizable), no al servidor.
 *
 * Consulta pura: sin transacción ni bitácora, mismo criterio que
 * `ExportarTicketsUseCase`/`ExportarComprasUseCase`.
 */
export class ExportarEquiposUseCase {
  constructor(private readonly listarEquiposUseCase: Pick<ListarEquiposUseCase, 'execute'>) {}

  async execute<F extends FormatoExport | undefined = undefined>(
    dto: ListarEquiposDto = {},
    formato?: F,
  ): Promise<Result<ArchivoExportDe<F>, DomainError>> {
    const listado = await this.listarEquiposUseCase.execute({
      incluirDadosDeBaja: dto.incluirDadosDeBaja ?? false,
    });

    if (listado.isFail()) {
      return Result.fail(listado.getError());
    }

    const equipos = listado.getValue();

    return armarExport({
      filas: equipos,
      // Post-fetch: ver docblock de la clase ("Unbounded memory", residual aceptado).
      total: equipos.length,
      tope: TOPE_FILAS_EXPORT,
      columnas: ExportarEquiposUseCase.columnas(),
      prefijo: 'equipos',
      formato,
      alExceder: (total, tope) => new ExportacionDemasiadoGrandeError(total, tope),
    });
  }

  /** Columnas fijas del archivo — espejan exactamente la tabla en pantalla, sin importe ni fechas. */
  private static columnas(): readonly ColumnaCsv<EquipoInformaticoEntity>[] {
    return [
      { encabezado: 'Nombre', valor: (e) => e.nombre },
      { encabezado: 'Marca', valor: (e) => e.marca },
      { encabezado: 'N.º de serie', valor: (e) => e.numeroSerie },
      { encabezado: 'Estado', valor: (e) => (e.activo ? 'Activo' : 'Baja') },
    ];
  }
}
