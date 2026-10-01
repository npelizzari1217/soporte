import {
  EstadoReposicionInsumo,
  evaluarReposicion,
} from '../../domain/entities/estado-reposicion-insumo';
import {
  calcularSaldos,
  ConteoPorCondicion,
  saldosDesdeUnidades,
  SaldosInsumo,
  SumasPorCondicionYTipo,
} from '../../domain/entities/tipo-movimiento-insumo';
import { SeguimientoInsumo } from '../../domain/entities/unidad-insumo.entity';
import {
  FilaCatalogoStock,
  FiltrosCatalogoStock,
  IInsumoRepository,
} from '../../domain/ports/i-insumo.repository';
import { IMovimientoInsumoRepository } from '../../domain/ports/i-movimiento-insumo.repository';
import { IUnidadInsumoRepository } from '../../domain/ports/i-unidad-insumo.repository';

/**
 * Filtros del reporte. `familiaId` y `esRepuesto` se resuelven en SQL; los dos
 * booleanos se aplican DESPUES del dominio, porque dependen del saldo y del
 * estado de reposicion ya calculados.
 */
export interface FiltrosReporteStock extends FiltrosCatalogoStock {
  soloBajoMinimo?: boolean;
  ocultarSinStock?: boolean;
}

/** Una fila del reporte: el catalogo mas el saldo y la lectura de reposicion. */
export interface FilaReporteStock {
  insumoId: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  seguimiento: SeguimientoInsumo;
  familia: FilaCatalogoStock['familia'];
  unidadMedida: FilaCatalogoStock['unidadMedida'];
  /** Saldo por condicion y total. Pueden ser negativos; se informan tal cual. */
  saldos: SaldosInsumo;
  /** Punto de reposicion, o `null` si el insumo no tiene uno definido. */
  stockMinimo: number | null;
  estadoReposicion: EstadoReposicionInsumo;
}

export interface ReporteStock {
  /** Instante tomado ANTES de leer: la foto es posterior a esta hora. */
  generadoEn: Date;
  filas: FilaReporteStock[];
}

const CONTEO_VACIO: ConteoPorCondicion = { NUEVO: 0, USADO: 0 };

/**
 * ConsultarReporteStockUseCase — el stock de todos los insumos vigentes en una
 * sola pasada (ADR-2 de `reporte-stock-insumos`).
 *
 * Mismo criterio que la ficha (`ConsultarStockInsumoUseCase`): un insumo
 * `NINGUNO` toma el saldo de la bitacora (`calcularSaldos`) y uno `SERIE` el de
 * sus unidades `EN_DEPOSITO` (`saldosDesdeUnidades`, las pendientes de serie
 * cuentan). La formula vive en el dominio; aca no hay una segunda copia.
 *
 * **Sin transaccion y sin lock, a proposito:** es una lectura. Los `Pick` del
 * constructor solo exponen los metodos de lote, asi que una consulta por
 * insumo (N+1) o un lock no compilan. Libro y unidades no se leen de forma
 * atomica entre si; lo declara `generadoEn`.
 */
export class ConsultarReporteStockUseCase {
  constructor(
    private readonly insumoRepo: Pick<IInsumoRepository, 'listarParaReporteStock'>,
    private readonly movimientoRepo: Pick<IMovimientoInsumoRepository, 'sumByTipoDeInsumos'>,
    private readonly unidadRepo: Pick<
      IUnidadInsumoRepository,
      'contarEnDepositoPorCondicionDeInsumos'
    >,
    private readonly ahora: () => Date,
  ) {}

  async execute(filtros: FiltrosReporteStock = {}): Promise<ReporteStock> {
    const generadoEn = this.ahora();

    const catalogo = await this.insumoRepo.listarParaReporteStock({
      familiaId: filtros.familiaId,
      esRepuesto: filtros.esRepuesto,
    });

    const idsSerie = catalogo.filter((f) => f.seguimiento === 'SERIE').map((f) => f.insumoId);
    const idsLibro = catalogo.filter((f) => f.seguimiento !== 'SERIE').map((f) => f.insumoId);

    // Una consulta por tipo de seguimiento, y ninguna si no hay ids de ese tipo.
    const [sumas, conteos] = await Promise.all([
      idsLibro.length > 0
        ? this.movimientoRepo.sumByTipoDeInsumos(idsLibro)
        : Promise.resolve(new Map<string, SumasPorCondicionYTipo>()),
      idsSerie.length > 0
        ? this.unidadRepo.contarEnDepositoPorCondicionDeInsumos(idsSerie)
        : Promise.resolve(new Map<string, ConteoPorCondicion>()),
    ]);

    const filas = catalogo.map((fila): FilaReporteStock => {
      const saldos =
        fila.seguimiento === 'SERIE'
          ? saldosDesdeUnidades(conteos.get(fila.insumoId) ?? CONTEO_VACIO)
          : calcularSaldos(sumas.get(fila.insumoId) ?? CEROS_LIBRO);
      return {
        insumoId: fila.insumoId,
        codigo: fila.codigo,
        nombre: fila.nombre,
        activo: fila.activo,
        seguimiento: fila.seguimiento,
        familia: fila.familia,
        unidadMedida: fila.unidadMedida,
        saldos,
        stockMinimo: fila.stockMinimo,
        // La reposicion mira solo lo NUEVO: los usados no ocultan la falta.
        estadoReposicion: evaluarReposicion(saldos.NUEVO, fila.stockMinimo),
      };
    });

    const filtradas = filas
      .filter((f) => filtros.soloBajoMinimo !== true || f.estadoReposicion === 'BAJO_MINIMO')
      // Solo se oculta el cero exacto en ambas condiciones: un negativo, o un
      // NUEVO 3 con USADO -3, es un dato que el reporte debe mostrar.
      .filter(
        (f) => filtros.ocultarSinStock !== true || !(f.saldos.NUEVO === 0 && f.saldos.USADO === 0),
      )
      .sort((a, b) => (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0));

    return { generadoEn, filas: filtradas };
  }
}

const CEROS_TIPO = {
  ENTRADA: 0,
  SALIDA: 0,
  AJUSTE_POSITIVO: 0,
  AJUSTE_NEGATIVO: 0,
};
const CEROS_LIBRO = { NUEVO: CEROS_TIPO, USADO: CEROS_TIPO } as SumasPorCondicionYTipo;
