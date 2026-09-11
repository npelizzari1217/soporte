import { Result } from '../../../shared/domain/result';
import { SecuenciaCodigoInsumoAgotadaError } from '../errors/insumos.errors';
import { IInsumoRepository, PrefijoCodigoInsumo } from '../ports/i-insumo.repository';

/** Cantidad de dígitos de la secuencia formateada (ej. `INS-0007`). */
export const NUMERADOR_INSUMO_SECUENCIA_DIGITOS = 4;

/** Tope de la secuencia: 4 dígitos no pueden expresar más que esto. */
const NUMERADOR_INSUMO_SECUENCIA_TOPE = 9999;

/**
 * NumeradorInsumo — servicio de dominio para la generación del `codigo`
 * autogenerado de un insumo (issue #162).
 *
 * Formato: `{PREFIJO}-{SECUENCIA_4_DIGITOS}` (ej. `INS-0007`, `REP-0042`).
 * El prefijo es `REP` si la familia del insumo es de repuestos, `INS` si no
 * — decidido por el CALLER (`CrearInsumoUseCase`), que ya conoce
 * `FamiliaInsumoEntity.esRepuesto`; este servicio no consulta el catálogo de
 * familias.
 *
 * Las DOS series (`INS`/`REP`) son independientes y correlativas DENTRO del
 * tenant: crear un `REP-` no mueve el contador de `INS-`, y viceversa. Se
 * obtiene vía `IInsumoRepository.findLastSecuenciaCodigo`, que retorna 0 si
 * la serie todavía no tiene ningún código con ese formato.
 *
 * `generarFormato` es función pura, testeable sin Prisma. `generarCodigo`
 * depende del puerto `IInsumoRepository` (mockeado en tests unitarios). Sin
 * imports de Prisma ni NestJS — dominio puro, mismo patrón que
 * `NumeradorTicket`/`NumeradorCompra`.
 *
 * El advisory lock que serializa la concurrencia sobre
 * `findLastSecuenciaCodigo` vive en INFRAESTRUCTURA
 * (`PrismaInsumoRepository.findLastSecuenciaCodigo`), NO acá — este servicio
 * es dominio puro y no conoce Postgres. Ver el JSDoc de ese método para el
 * detalle de la garantía de concurrencia.
 *
 * Ref: issue #162, precedente `NumeradorTicket`/`NumeradorCompra`.
 */
export class NumeradorInsumo {
  constructor(private readonly insumoRepo: Pick<IInsumoRepository, 'findLastSecuenciaCodigo'>) {}

  /**
   * Genera el próximo `codigo` de la serie que corresponde.
   *
   * @param esRepuesto `true` genera en la serie `REP`, `false` en la serie `INS`.
   * @returns El código generado, o `SecuenciaCodigoInsumoAgotadaError` si la
   *   serie superaría los 4 dígitos.
   */
  async generarCodigo(
    esRepuesto: boolean,
  ): Promise<Result<string, SecuenciaCodigoInsumoAgotadaError>> {
    const prefijo: PrefijoCodigoInsumo = esRepuesto ? 'REP' : 'INS';

    const lastSecuencia = await this.insumoRepo.findLastSecuenciaCodigo(prefijo);
    const nextSecuencia = lastSecuencia + 1;

    if (nextSecuencia > NUMERADOR_INSUMO_SECUENCIA_TOPE) {
      return Result.fail(new SecuenciaCodigoInsumoAgotadaError(prefijo));
    }

    return Result.ok(NumeradorInsumo.generarFormato(prefijo, nextSecuencia));
  }

  /**
   * Formatea el código a partir de sus partes. Función pura.
   *
   * @param prefijo   `INS` o `REP`.
   * @param secuencia Número de secuencia (ya incrementado). Sin cap superior
   *                  acá: el overflow guard vive en `generarCodigo`.
   */
  static generarFormato(prefijo: PrefijoCodigoInsumo, secuencia: number): string {
    return `${prefijo}-${String(secuencia).padStart(NUMERADOR_INSUMO_SECUENCIA_DIGITOS, '0')}`;
  }
}
