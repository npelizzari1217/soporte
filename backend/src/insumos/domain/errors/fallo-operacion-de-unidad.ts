import { DomainError } from '../../../shared/domain/result';

/**
 * FalloOperacionDeUnidad — envoltorio LANZADO de un `DomainError` que aparece
 * después de haber escrito, dentro de la transacción de una operación de
 * unidades (sdd/repuestos-numero-de-serie, ADR-4).
 *
 * `OperacionesUnidadInsumo` valida todo antes de escribir, así que un
 * `Result.fail` nunca sigue a una escritura. La única falla posterior es la
 * violación de unicidad del serial (P2002): el repositorio la traduce a
 * `SerialDuplicadoError` y la lanza envuelta acá para abortar la transacción
 * del llamador; el caso de uso la atrapa afuera de su `run()` y devuelve
 * `errorDeDominio` como `Result.fail`. Mismo patrón que `FalloSalidaDeStock`.
 *
 * No es un `DomainError` y no sale del módulo: si escapara, sería un 500.
 */
export class FalloOperacionDeUnidad extends Error {
  constructor(readonly errorDeDominio: DomainError) {
    super(`La operación de unidades falló: ${errorDeDominio.message}`);
    this.name = 'FalloOperacionDeUnidad';
  }
}
