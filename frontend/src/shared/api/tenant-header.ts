/**
 * tenant-header — holder module-level del X-Tenant-Id activo (Dz5/R5).
 *
 * Único punto que `apiFetch` (client.ts) lee para inyectar el header en TODA
 * request operativa (tickets, compras, equipos, reparaciones, admin). Solo un
 * root (isGlobalAdmin=true) con un cliente seleccionado lo puebla — para un
 * no-root el holder es SIEMPRE `null` (R5-c [CRITICAL]).
 *
 * Sincronizado por el efecto puente de `TenantContextProvider` (Dz5), único
 * lugar que decide el criterio `isGlobalAdmin && clienteId`. Este módulo NO
 * conoce React ni sesión — es una simple caja de transporte, mismo patrón
 * que el singleton `refreshPromise` de `client.ts`.
 *
 * Spec: [SPEC:frontend-api-client/R5 Propagación centralizada de X-Tenant-Id]
 */

let currentTenantId: string | null = null;

/** Setea (o limpia con `null`) el tenant activo para inyección de header. */
export function setTenantHeader(clienteId: string | null): void {
  currentTenantId = clienteId;
}

/**
 * Detecta entorno server (Next.js SSR/RSC) vs. browser.
 * Extraída como función propia para poder inyectarla en tests: jsdom siempre
 * define `window`, así que el branch real de servidor no es alcanzable en el
 * entorno de test sin esta indirección (evita mockear globals o `as any`).
 */
function isServer(): boolean {
  return typeof window === "undefined";
}

/**
 * Lee el tenant activo actual. `null` = no inyectar X-Tenant-Id.
 *
 * Guarda SSR (Judgment Day R1, defensa en profundidad): el holder es un
 * singleton module-level. En el server de Next ese estado se comparte entre
 * requests concurrentes de USUARIOS DISTINTOS — si algún día un Server
 * Component invocara `apiFetch`/`getTenantHeader`, esta guarda garantiza
 * `null` SIEMPRE en ese entorno, cerrando la clase de fuga de raíz sin
 * depender solo de que el caller sea disciplinado sobre "solo client".
 *
 * `checkIsServer` es inyectable (default = `isServer` real) únicamente para
 * poder testear el branch server desde jsdom.
 */
export function getTenantHeader(checkIsServer: () => boolean = isServer): string | null {
  if (checkIsServer()) return null;
  return currentTenantId;
}
