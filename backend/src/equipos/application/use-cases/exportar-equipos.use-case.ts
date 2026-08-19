import { armarExportCsv } from '../../../shared/application/armar-export-csv';
import { DomainError, Result } from '../../../shared/domain/result';
import { TOPE_FILAS_EXPORT } from '../../../shared/domain/tope-filas-export';
import { ColumnaCsv } from '../../../shared/infrastructure/csv/csv';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { ExportacionDemasiadoGrandeError } from '../../domain/errors/equipos.errors';
import { ListarEquiposUseCase } from './listar-equipos.use-case';

/** Archivo listo para que el controller lo entregue como descarga. */
export interface ExportarEquiposResult {
  /** CSV completo, con BOM y encabezado. */
  contenido: string;
  /** Nombre sugerido, con la fecha de exportación en hora de Argentina (`equipos-2026-08-19.csv`). */
  nombreArchivo: string;
}

/**
 * ExportarEquiposUseCase — vuelca a CSV el inventario ACTIVO completo de
 * equipos IT del tenant (sdd/exportar-listados-csv, capability
 * exportacion-equipos).
 *
 * **Sin DTO de entrada, y es intencional, no un olvido** (spec, "No filter
 * parameters are accepted"): `IEquipoInformaticoRepository.findAllActive()`
 * no acepta ningún argumento, y este caso de uso tampoco — a diferencia de
 * `ExportarTicketsUseCase`, acá NO hay un `Omit<Filtros, ...>` que declarar
 * porque no existe pantalla de filtros que espejar. Si en el futuro alguien
 * "arregla" esto agregándole parámetros, está agregando un comportamiento
 * que la spec pide explícitamente que NO exista.
 *
 * **Por qué compone `ListarEquiposUseCase` en vez de inyectar
 * `IEquipoInformaticoRepository`** (design D4): con un solo argumento en el
 * constructor no hay NADA que consultar por fila — el tipo lo hace
 * estructuralmente imposible, no es una convención que se pueda romper. El
 * scoping por tenant lo resuelve el repositorio Prisma vía `TenantContext`,
 * heredado sin agregar ninguna consulta nueva.
 *
 * **Por qué el tope se chequea DESPUÉS de traer todo** (design D4, threat
 * "Unbounded memory", residual aceptado): `findAllActive()` no tiene un
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

  async execute(): Promise<Result<ExportarEquiposResult, DomainError>> {
    const listado = await this.listarEquiposUseCase.execute();

    if (listado.isFail()) {
      return Result.fail(listado.getError());
    }

    const equipos = listado.getValue();

    return armarExportCsv({
      filas: equipos,
      // Post-fetch: ver docblock de la clase ("Unbounded memory", residual aceptado).
      total: equipos.length,
      tope: TOPE_FILAS_EXPORT,
      columnas: ExportarEquiposUseCase.columnas(),
      prefijo: 'equipos',
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
