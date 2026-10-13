import type { LookupAddress } from 'node:dns';
import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { Result } from '../../shared/domain/result';
import {
  DestinoWebhookIrresolubleError,
  DestinoWebhookNoPublicoError,
  UrlWebhookInvalidaError,
} from './integraciones.errors';

/** Largo máximo de la URL del destino: el de la columna `webhook_destinos.url` (VARCHAR 2048). */
export const LARGO_MAXIMO_URL_WEBHOOK = 2048;

/** Rangos IPv4 que no son destinos públicos (RFC 6890 y afines). */
const IPV4_NO_PUBLICAS: ReadonlyArray<[string, number]> = [
  ['0.0.0.0', 8], // "esta red"
  ['10.0.0.0', 8], // privada
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (incluye metadatos de nube)
  ['172.16.0.0', 12], // privada
  ['192.0.0.0', 24], // asignaciones de protocolo IETF
  ['192.0.2.0', 24], // documentación
  ['192.88.99.0', 24], // relay 6to4
  ['192.168.0.0', 16], // privada
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentación
  ['203.0.113.0', 24], // documentación
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reservada, incluye el broadcast 255.255.255.255
];

/**
 * Rangos IPv6 que no son públicos aunque caen en la unicast global 2000::/3. Fuera de 2000::/3 nada
 * es público: eso ya excluye `::`, `::1`, fc00::/7, fe80::/10, ff00::/8 y NAT64 64:ff9b::/96.
 */
const IPV6_GLOBALES_NO_PUBLICAS: ReadonlyArray<[string, number]> = [
  ['2001::', 23], // asignaciones IETF, incluye Teredo 2001::/32
  ['2001:db8::', 32], // documentación
  ['2002::', 16], // 6to4: lleva una IPv4 embebida que puede ser privada
];

const BLOQUEO_IPV4 = new BlockList();
for (const [red, prefijo] of IPV4_NO_PUBLICAS) BLOQUEO_IPV4.addSubnet(red, prefijo, 'ipv4');
const BLOQUEO_IPV6 = new BlockList();
for (const [red, prefijo] of IPV6_GLOBALES_NO_PUBLICAS)
  BLOQUEO_IPV6.addSubnet(red, prefijo, 'ipv6');

/** Los 8 grupos de 16 bits de una IPv6, o `null` si no se puede normalizar (p. ej. con zona `%`). */
function gruposIpv6(ip: string): number[] | null {
  let normalizada: string;
  try {
    // El parser WHATWG normaliza la IPv6 y pasa una IPv4 embebida a hexadecimal.
    normalizada = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  } catch {
    return null;
  }
  const [izquierda, derecha] = normalizada.split('::');
  const a = izquierda ? izquierda.split(':') : [];
  const b = derecha ? derecha.split(':') : [];
  const ceros = normalizada.includes('::') ? 8 - a.length - b.length : 0;
  const grupos = [...a, ...Array<string>(ceros).fill('0'), ...b].map((g) => parseInt(g, 16));
  return grupos.length === 8 && grupos.every((g) => g >= 0 && g <= 0xffff) ? grupos : null;
}

/**
 * Indica si una IP (v4 o v6) es un destino público. Rechaza loopback, privadas, link-local, CGNAT,
 * 0.0.0.0/8, multicast, broadcast, reservadas, de documentación, unique-local, `::` y `::1`. Una
 * IPv6 con IPv4 embebida (`::ffff:a.b.c.d`) se juzga por la IPv4. Cualquier otra cosa: `false`.
 */
export function esIpPublica(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return !BLOQUEO_IPV4.check(ip, 'ipv4');
  if (version !== 6) return false;

  const grupos = gruposIpv6(ip);
  if (!grupos) return false;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = grupos;
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return esIpPublica(`${g6 >> 8}.${g6 & 0xff}.${g7 >> 8}.${g7 & 0xff}`);
  }
  if ((g0 & 0xe000) !== 0x2000) return false;
  return !BLOQUEO_IPV6.check(grupos.map((g) => g.toString(16)).join(':'), 'ipv6');
}

/** El hostname de una URL sin los corchetes de una IPv6 literal. */
function sinCorchetes(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

/**
 * Validación sintáctica de la URL del destino (odd/webhooks, CA8). Exige `https:` con host, sin
 * credenciales, de hasta `LARGO_MAXIMO_URL_WEBHOOK` caracteres, y rechaza una IP literal que no
 * sea pública o el nombre `localhost`. No resuelve DNS: eso es `resolverDestinoSeguro`.
 */
export function validarUrlDestino(url: string): Result<URL, UrlWebhookInvalidaError> {
  const falla = (motivo: string) =>
    Result.fail<URL, UrlWebhookInvalidaError>(new UrlWebhookInvalidaError(motivo));
  if (url.length > LARGO_MAXIMO_URL_WEBHOOK) {
    return falla(`admite hasta ${LARGO_MAXIMO_URL_WEBHOOK} caracteres.`);
  }
  let parseada: URL;
  try {
    parseada = new URL(url);
  } catch {
    return falla('no es una URL.');
  }
  if (parseada.protocol !== 'https:') return falla('debe usar HTTPS.');
  if (parseada.username || parseada.password) return falla('no puede llevar credenciales.');
  const host = sinCorchetes(parseada.hostname).toLowerCase();
  if (!host) return falla('le falta el host.');
  if (isIP(host) && !esIpPublica(host)) return falla('apunta a una IP que no es pública.');
  const nombre = host.endsWith('.') ? host.slice(0, -1) : host;
  if (nombre === 'localhost' || nombre.endsWith('.localhost')) {
    return falla('apunta a la máquina local.');
  }
  if (parseada.href.length > LARGO_MAXIMO_URL_WEBHOOK) {
    return falla(`admite hasta ${LARGO_MAXIMO_URL_WEBHOOK} caracteres.`);
  }
  return Result.ok(parseada);
}

/** Resolución DNS de todas las direcciones de un host; inyectable para los tests. */
export type BuscarDirecciones = (
  hostname: string,
  opciones: { all: true },
) => Promise<LookupAddress[]>;

type ErrorDestino = DestinoWebhookNoPublicoError | DestinoWebhookIrresolubleError;

const buscarDireccionesPorDefecto: BuscarDirecciones = (hostname, opciones) =>
  dnsLookup(hostname, opciones);

/**
 * Resuelve el host del destino y devuelve todas sus direcciones, o un error si alguna no es pública
 * (una respuesta mixta se rechaza entera) o si no resuelve. Se llama al guardar (T6) y en cada
 * envío (T5), que debe conectarse a una de estas direcciones y no volver a resolver.
 */
export async function resolverDestinoSeguro(
  hostname: string,
  buscar: BuscarDirecciones = buscarDireccionesPorDefecto,
): Promise<Result<LookupAddress[], ErrorDestino>> {
  let direcciones: LookupAddress[];
  try {
    direcciones = await buscar(sinCorchetes(hostname), { all: true });
  } catch {
    return Result.fail<LookupAddress[], ErrorDestino>(new DestinoWebhookIrresolubleError());
  }
  if (direcciones.length === 0) {
    return Result.fail<LookupAddress[], ErrorDestino>(new DestinoWebhookIrresolubleError());
  }
  if (direcciones.some((d) => !esIpPublica(d.address))) {
    return Result.fail<LookupAddress[], ErrorDestino>(new DestinoWebhookNoPublicoError());
  }
  return Result.ok<LookupAddress[], ErrorDestino>(direcciones);
}
