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

/** Lee el tenant activo actual. `null` = no inyectar X-Tenant-Id. */
export function getTenantHeader(): string | null {
  return currentTenantId;
}
