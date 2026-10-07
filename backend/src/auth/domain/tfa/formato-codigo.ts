/** Formatos de codigo del segundo paso (sdd/verificacion-dos-pasos, T5, I3). */

export type ClaseCodigo = 'totp' | 'recuperacion' | 'invalido';

const LARGO_RECUPERACION = 12;
const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]+$/;

/** Mayusculas, sin guiones ni espacios, `O->0`, `I/L->1`. `null` si el largo o el alfabeto no cierran. */
export function normalizarCodigoRecuperacion(entrada: string): string | null {
  const limpio = entrada
    .toUpperCase()
    .replace(/[-\s]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (limpio.length !== LARGO_RECUPERACION || !CROCKFORD.test(limpio)) return null;
  return limpio;
}

/** 6 digitos = TOTP; un codigo de recuperacion normalizable = recuperacion; el resto, invalido. */
export function clasificarCodigo(entrada: string): ClaseCodigo {
  if (/^\d{6}$/.test(entrada.trim())) return 'totp';
  return normalizarCodigoRecuperacion(entrada) === null ? 'invalido' : 'recuperacion';
}

/** Forma canonica del email para claves del limitador (I3). */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}
