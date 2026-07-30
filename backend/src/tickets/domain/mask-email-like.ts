/**
 * maskEmailLike — enmascara una dirección de email (o cualquier fragmento de
 * texto con forma de email) dejando visible solo el primer caracter local y
 * el dominio completo (ej. "usuario@dominio.com" → "u***@dominio.com").
 *
 * Función pura scoped a la feature `tickets` (Judgment Day PR2 Ronda 2,
 * issue C / Ronda 3, issue C): antes vivía como `Email.maskRaw()` público
 * en el VO, lo que violaba value-objects/SKILL.md ("no behavior unrelated
 * to the value" — un VO no debe ser un namespace de una función de string
 * genérica). Se extrajo a `shared/domain/` en Ronda 2, pero solo la usan
 * `Email` (domain) y `NodemailerEmailSender` (infra) — ambos dentro de
 * `tickets` — así que no corresponde al shared kernel global (Scope Rule,
 * CLAUDE.md §2): se movió a `tickets/domain/` en Ronda 3. Reusada por
 * tanto `Email.mask()` (dominio) como `sanitizeCausa()`
 * (`nodemailer-email-sender.adapter.ts`, infra) para que ambos apliquen la
 * MISMA regla de enmascarado sin que ninguno dependa del otro.
 *
 * Ref: Requirement 7 (NUNCA loguear el email completo en claro).
 */
export function maskEmailLike(raw: string): string {
  if (raw.length === 0) return '(vacío)';

  const at = raw.indexOf('@');
  if (at <= 0) {
    return `${raw.slice(0, 1)}***`;
  }

  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  return `${local.slice(0, 1)}***@${domain}`;
}
