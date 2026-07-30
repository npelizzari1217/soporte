/**
 * maskIfSecret — única fuente de verdad del enmascarado de valores
 * `esSecreto=true` en `configuracion/` (design §5.1).
 *
 * Usado en 3 puntos (PR4/PR3): (1) `ActualizarConfigUseCase` al construir el
 * evento `ConfiguracionCambiada` (Dz7 — el cleartext NUNCA entra al evento),
 * (2) `AuditConfiguracionHandler`/`PrismaAuditLog` al persistir `AuditEntry`
 * (REQUISITO DURO, STATE.md "Judgment Day — PR1 — fixes Ronda 2" fix #6:
 * `audit_entries` no tiene `iv`/`authTag` — solo puede guardar el valor YA
 * enmascarado, nunca el plaintext ni el ciphertext), (3) `LeerConfigUseCase`
 * en la respuesta de API (R3).
 *
 * Distinto de `SmtpConfig.toSafeLog()` (que usa su propio literal local,
 * ver STATE.md PR2 desviación #2 — evita que `shared/` dependa de
 * `configuracion/`): acá SÍ es el punto único de verdad para todo lo que
 * vive dentro del dominio `configuracion/`.
 *
 * Ref design: §5.1. Ref spec: R3, R5. Tarea: 3.1 (PR3).
 */
export const SECRET_MASK = '********';

/**
 * `null` se preserva tal cual (representa "no había fila previa" — ver
 * `AuditEntry.valorAnterior`), nunca se enmascara un valor inexistente.
 */
export const maskIfSecret = (valor: string | null, esSecreto: boolean): string | null =>
  esSecreto ? (valor === null ? null : SECRET_MASK) : valor;
