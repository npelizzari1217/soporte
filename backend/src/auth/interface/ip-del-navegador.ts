import { isIP } from 'node:net';

export const SIN_IP = 'sin-ip';
export const CABECERA_IP_NAVEGADOR = 'x-soporte-ip-navegador';

export interface RequestConIp {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

const PARES_LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * IP del navegador para el limitador (I4). El BFF corre en el mismo VPS y manda la IP real en
 * `x-soporte-ip-navegador`: se honra solo desde un par loopback y si es una IP valida (la forma
 * con puerto no lo es). Desde cualquier otro par se usa el socket; sin dato, `sin-ip`.
 */
export function ipDelNavegador(req: RequestConIp): string {
  const par = req.socket?.remoteAddress;
  if (par !== undefined && PARES_LOOPBACK.has(par)) {
    const cabecera = req.headers[CABECERA_IP_NAVEGADOR];
    return typeof cabecera === 'string' && isIP(cabecera.trim()) !== 0 ? cabecera.trim() : SIN_IP;
  }
  return par ? par.replace(/^::ffff:/, '') : SIN_IP;
}
