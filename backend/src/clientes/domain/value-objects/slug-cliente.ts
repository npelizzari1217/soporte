import { Result } from '../../../shared/domain/result';
import { SlugInvalidoError } from '../errors/clientes.errors';

/**
 * Largo maximo del slug: espeja `clientes.slug VARCHAR(63)` (un label DNS).
 */
export const SLUG_MAX_LENGTH = 63;

/**
 * Formato del slug: minusculas, digitos y guion, sin guion al inicio ni al
 * final. FUENTE UNICA: la copian el Zod del frontend y el CHECK
 * `clientes_slug_formato_check` de la migracion master.
 */
export const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * El formato no alcanza: `[a-z0-9-]` acepta un UUID en minusculas, que seria
 * un identificador interno expuesto en la URL publica.
 */
const FORMA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * SlugCliente — value object del slug que identifica a un cliente en la URL
 * del formulario publico. Valida formato, largo y rechaza la forma de UUID.
 * La comparacion contra el `id` y el `dbName` del cliente la hace
 * `ClienteEntity.configurarSlug()`, que conoce ambos.
 *
 * No normaliza (no pasa a minusculas ni recorta): un valor fuera de formato
 * se rechaza, no se corrige en silencio.
 */
export class SlugCliente {
  private constructor(private readonly _valor: string) {}

  static crear(valor: string): Result<SlugCliente, SlugInvalidoError> {
    if (typeof valor !== 'string' || valor.length === 0) {
      return Result.fail(new SlugInvalidoError('no puede estar vacío.'));
    }
    if (valor.length > SLUG_MAX_LENGTH) {
      return Result.fail(new SlugInvalidoError(`excede ${SLUG_MAX_LENGTH} caracteres.`));
    }
    if (!SLUG_REGEX.test(valor)) {
      return Result.fail(
        new SlugInvalidoError(
          'solo admite minúsculas, dígitos y guiones, sin guion al inicio ni al final.',
        ),
      );
    }
    if (FORMA_UUID.test(valor)) {
      return Result.fail(new SlugInvalidoError('no puede tener forma de UUID.'));
    }
    return Result.ok(new SlugCliente(valor));
  }

  get valor(): string {
    return this._valor;
  }
}
