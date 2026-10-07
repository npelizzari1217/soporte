import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ITotpService } from '../../domain/ports/totp-service.port';

const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIODO_S = 30;
const DIGITOS = 6;
const VENTANA = 1;
const BYTES_SECRETO = 20;

function codificarBase32(bytes: Buffer): string {
  let bits = 0;
  let acumulado = 0;
  let salida = '';
  for (const byte of bytes) {
    acumulado = (acumulado << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO_BASE32[(acumulado >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) salida += ALFABETO_BASE32[(acumulado << (5 - bits)) & 31];
  return salida;
}

function decodificarBase32(texto: string): Buffer | null {
  if (!/^[A-Z2-7]+$/.test(texto)) return null;
  let bits = 0;
  let acumulado = 0;
  const bytes: number[] = [];
  for (const c of texto) {
    acumulado = (acumulado << 5) | ALFABETO_BASE32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bytes.push((acumulado >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function codigoDelPaso(clave: Buffer, paso: number): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(paso));
  const hmac = createHmac('sha1', clave).update(contador).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binario = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binario % 10 ** DIGITOS).padStart(DIGITOS, '0');
}

/** TOTP RFC 6238 (SHA-1, 6 digitos, paso 30 s, ventana +-1). ADR-2: sin dependencias nuevas. */
export class TotpNativoService implements ITotpService {
  generarSecreto(): string {
    return codificarBase32(randomBytes(BYTES_SECRETO));
  }

  uri(secreto: string, email: string): string {
    const etiqueta = `Soporte:${encodeURIComponent(email)}`;
    return `otpauth://totp/${etiqueta}?secret=${secreto}&issuer=Soporte&algorithm=SHA1&digits=${DIGITOS}&period=${PERIODO_S}`;
  }

  verificar(secreto: string, codigo: string, ahora: Date): number | null {
    if (!new RegExp(`^\\d{${DIGITOS}}$`).test(codigo)) return null;
    const clave = decodificarBase32(secreto);
    if (!clave || clave.length === 0) return null;
    const actual = Math.floor(ahora.getTime() / 1000 / PERIODO_S);
    const recibido = Buffer.from(codigo);
    let aceptado: number | null = null;
    // Recorre toda la ventana sin cortar: el tiempo no depende de cual paso coincide.
    for (let paso = actual - VENTANA; paso <= actual + VENTANA; paso++) {
      if (paso < 0) continue;
      const coincide = timingSafeEqual(Buffer.from(codigoDelPaso(clave, paso)), recibido);
      if (coincide && aceptado === null) aceptado = paso;
    }
    return aceptado;
  }
}
