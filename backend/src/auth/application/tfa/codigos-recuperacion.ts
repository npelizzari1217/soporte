import { randomBytes } from 'node:crypto';
import { IHashProvider } from '../../domain/ports/i-hash.provider';
import { ITfaRepository } from '../../domain/ports/tfa-repository.port';
import { normalizarCodigoRecuperacion } from '../../domain/tfa/formato-codigo';

const CANTIDAD = 10;
/** Crockford base32: el mismo alfabeto que acepta `normalizarCodigoRecuperacion`. */
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Un codigo de 12 caracteres mostrado como `XXXX-XXXX-XXXX`. */
const generarCodigo = (): string => {
  const crudo = Array.from(randomBytes(12), (b) => ALFABETO[b & 31]).join('');
  return `${crudo.slice(0, 4)}-${crudo.slice(4, 8)}-${crudo.slice(8)}`;
};

/**
 * Genera un juego nuevo de 10 codigos, guarda sus hashes reemplazando el anterior (una
 * transaccion en el repositorio) y devuelve el texto plano: es la unica vez que se ve (T4, T9).
 */
export async function emitirJuegoCodigos(
  repo: ITfaRepository,
  hash: IHashProvider,
  usuarioId: string,
): Promise<string[]> {
  const codigos = Array.from({ length: CANTIDAD }, generarCodigo);
  const hashes = await Promise.all(
    codigos.map((c) => hash.hash(normalizarCodigoRecuperacion(c) ?? c)),
  );
  await repo.reemplazarCodigos(usuarioId, hashes);
  return codigos;
}
