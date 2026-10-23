/**
 * Rutas públicas, sin sesión. Exactas salvo que terminen en `/`: esas son
 * prefijo (ver `esRutaPublica`). Las usan el middleware (dejarlas pasar sin
 * cookies) y `cortarSesion` (no cortar una sesión que no existe).
 *
 * ADR-C7 (sdd/csat/design): el route group `(publico)` de Next es
 * TRANSPARENTE a la URL — no alcanza por sí solo para dejar pasar una ruta.
 * Sin esta allowlist, `/encuesta/:token` cae en el mismo 307 a `/login` que
 * cualquier ruta protegida y la encuesta de satisfacción no se puede
 * responder nunca (el destinatario del mail NUNCA tiene sesión). Angosto a
 * propósito: una allowlist ancha (p. ej. `/`) dejaría pasar rutas protegidas
 * reales como `/tickets`.
 *
 * `/c/` (sdd/formulario-publico-qr, WU-16): formulario público al que llega
 * quien escanea el QR de un equipo o abre el link del mail de confirmación;
 * ninguno tiene sesión. Prefijo, no substring: `/clientes` y `/compras`
 * siguen protegidas.
 */
export const RUTAS_PUBLICAS: readonly string[] = ["/encuesta/", "/c/", "/restablecer-password", "/olvide-password"];

/**
 * Indica si la ruta está en la allowlist pública. Una entrada que termina en `/` es un
 * prefijo; si no, la ruta es exacta.
 * @param pathname ruta sin query ni hash.
 * @returns `true` si alguna entrada de `RUTAS_PUBLICAS` la cubre.
 */
export function esRutaPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some((ruta) => (ruta.endsWith("/") ? pathname.startsWith(ruta) : pathname === ruta));
}

/**
 * Indica si en esta ruta NO hay una sesión que cortar: las rutas públicas y `/login`, donde
 * todavía no se inició sesión.
 * @param pathname ruta sin query ni hash.
 * @returns `true` si la ruta se usa sin sesión.
 */
export function esRutaSinSesion(pathname: string): boolean {
  return pathname === "/login" || esRutaPublica(pathname);
}
