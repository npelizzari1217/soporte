/**
 * destinoPosLogin — guard contra open redirect para el parámetro `?siguiente=` del login
 * (sdd/formulario-publico-qr, WU-18, D3).
 *
 * Allowlist ESTRICTA de un solo destino: el path exacto `/pedido-qr`, con o sin query string.
 * Cualquier otro valor (URL absoluta, `//host`, `/\host`, otro path de la app, `/pedido-qr/x`,
 * `/pedido-qr%2f..`, valores con caracteres de control, espacios, backslash o fragmento) cae a `/`.
 *
 * Es una función pura sin dependencias de Next: la usan el hook de login (cliente) y el
 * middleware (Edge).
 */

const DESTINO_POR_DEFECTO = "/";

/**
 * `/pedido-qr` y, opcionalmente, `?` + query sin espacios, control, `\` ni `#`. El path no admite
 * nada más (ni `/` final ni `%`): lo que sigue a `/pedido-qr` es fin o `?`.
 */
const DESTINO_PERMITIDO = /^\/pedido-qr(\?[^\s\\#\u0000-\u001f\u007f]*)?$/;

export function destinoPosLogin(siguiente: string | null | undefined): string {
  if (typeof siguiente !== "string") return DESTINO_POR_DEFECTO;
  return DESTINO_PERMITIDO.test(siguiente) ? siguiente : DESTINO_POR_DEFECTO;
}
