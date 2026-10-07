export interface MembresiaParaObligacion {
  /** Si falta se asume activa: el login ya consulta solo las activas (ADR-8). */
  activa?: boolean;
  clienteRequiere2fa: boolean;
}

/** Regla L3: ROOT, o al menos una membresia activa cuyo cliente exige 2FA. */
export function esObligado2fa(
  isGlobalAdmin: boolean,
  membresiasActivas: readonly MembresiaParaObligacion[],
): boolean {
  return isGlobalAdmin || membresiasActivas.some((m) => m.activa !== false && m.clienteRequiere2fa);
}
