import {
  ArchivoExport,
  ArchivoExportDe,
  armarExport,
  FormatoExport,
} from '../../../shared/application/armar-export';
import { DomainError, Result } from '../../../shared/domain/result';
import { TOPE_FILAS_EXPORT } from '../../../shared/domain/tope-filas-export';
import { ColumnaCsv, decimalCelda } from '../../../shared/infrastructure/csv/csv';
import { ExportacionDemasiadoGrandeError } from '../../domain/errors/reparaciones.errors';
import { ListarReparacionesUseCase, ReparacionConTicket } from './listar-reparaciones.use-case';

/** Archivo listo para que el controller lo entregue como descarga (CSV como texto, xlsx como Buffer). */
export type ExportarReparacionesResult = ArchivoExport;

/**
 * ExportarReparacionesUseCase — vuelca a CSV el listado COMPLETO de
 * reparaciones edilicias del tenant (sdd/exportar-listados-csv, capability
 * exportacion-reparaciones).
 *
 * **Sin DTO de entrada, y es intencional, no un olvido** (spec, "No filter
 * parameters are accepted"): `ListarReparacionesUseCase.execute()` no acepta
 * ningún argumento, y este caso de uso tampoco — no hay pantalla de filtros
 * que espejar (mismo criterio que `ExportarEquiposUseCase`).
 *
 * **Por qué compone `ListarReparacionesUseCase` en vez de sus 5
 * repositorios propios** (design D4, la decisión clave de esta unidad):
 * `ListarReparacionesUseCase` YA resuelve el N+1 que este listado tenía
 * (`1 + 2N` consultas fila por fila → 5 consultas constantes, batched:
 * `ediliciaRepo.findAll`, `ticketRepo.findByIds`,
 * `subtareaRepo.findActiveByTicketEdiliciaIds`,
 * `comentarioRepo.contarPorTicketEdilicia`,
 * `reparacionCompraRepo.findComprasVinculadasByTicketEdiliciaIds`). Escribir
 * el export de la forma "obvia" — traer las reparaciones y después, POR
 * FILA, pedir su ticket base/subtareas/comentarios/compras vinculadas —
 * reintroduciría exactamente ese N+1 recién arreglado. Componiendo con un
 * ÚNICO argumento en el constructor no hay NADA que consultar por fila: el
 * tipo lo hace estructuralmente imposible, no es una convención que se
 * pueda romper sin querer. `exportar-reparaciones.use-case.spec.ts` prueba
 * esto con la implementación REAL de `ListarReparacionesUseCase` + 5 fakes
 * que cuentan sus llamadas: el conteo es IDÉNTICO corriendo el export con 1
 * fila y con 50 (task 5.1, WU3) — no sólo `=== 5` en aislado, que no
 * probaría constancia.
 *
 * **Por qué el tope se chequea DESPUÉS de traer todo** (design D4, threat
 * "Unbounded memory", mismo residual aceptado que equipos): el puerto de
 * `ListarReparacionesUseCase` no expone un `count()` — agregarle uno sería
 * un cambio de firma de puerto (prohibido en este cambio). `total` es por lo
 * tanto `items.length`, no el resultado de una consulta de conteo real. Esto
 * NO es una regresión: el listado en pantalla (`GET /reparaciones`) ya
 * materializa exactamente el mismo conjunto hoy.
 *
 * Consulta pura: sin transacción ni bitácora, mismo criterio que
 * `ExportarEquiposUseCase`/`ExportarTicketsUseCase`/`ExportarComprasUseCase`.
 */
export class ExportarReparacionesUseCase {
  constructor(
    private readonly listarReparacionesUseCase: Pick<ListarReparacionesUseCase, 'execute'>,
  ) {}

  async execute<F extends FormatoExport | undefined = undefined>(
    formato?: F,
  ): Promise<Result<ArchivoExportDe<F>, DomainError>> {
    const listado = await this.listarReparacionesUseCase.execute();

    if (listado.isFail()) {
      return Result.fail(listado.getError());
    }

    const reparaciones = listado.getValue();

    return armarExport({
      filas: reparaciones,
      // Post-fetch: ver docblock de la clase ("Unbounded memory", residual aceptado).
      total: reparaciones.length,
      tope: TOPE_FILAS_EXPORT,
      columnas: ExportarReparacionesUseCase.columnas(),
      prefijo: 'reparaciones',
      formato,
      alExceder: (total, tope) => new ExportacionDemasiadoGrandeError(total, tope),
    });
  }

  /** Columnas fijas del archivo — espejan exactamente la tabla en pantalla. */
  private static columnas(): readonly ColumnaCsv<ReparacionConTicket>[] {
    return [
      { encabezado: 'Número', valor: (r) => r.ticket.numero },
      { encabezado: 'Título', valor: (r) => r.ticket.titulo },
      { encabezado: 'Ubicación', valor: (r) => r.ticketEdilicia.ubicacion },
      {
        encabezado: 'Avance %',
        // `porcentajeAvance` es un `Decimal(5,2)` — un PORCENTAJE, no un
        // importe. Deliberadamente NO usa `montoCsv` (nombrada, documentada
        // y pensada para moneda): reusar una función de moneda para un
        // porcentaje mezclaría semánticas que hoy son distintas y podrían
        // divergir mañana (p. ej. si `montoCsv` empezara a agregar un
        // símbolo `$`). Sí reusa el MISMO criterio de formato — coma
        // decimal, dos decimales fijos, sin separador de miles — porque es
        // el que Excel en español necesita para leer la celda como número
        // y no como texto, y ese criterio es de LOCALIZACIÓN, no de moneda.
        valor: (r) => decimalCelda(r.ticketEdilicia.porcentajeAvance),
      },
    ];
  }
}
