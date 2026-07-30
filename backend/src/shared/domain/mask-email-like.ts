/**
 * maskEmailLike — enmascara una dirección de email (o cualquier fragmento de
 * texto con forma de email) dejando visible solo el primer caracter local y
 * el dominio completo (ej. "usuario@dominio.com" → "u***@dominio.com").
 *
 * Función pura del shared kernel (Judgment Day PR2 Ronda 2, issue C):
 * antes vivía como `Email.maskRaw()` público en el VO, lo que violaba
 * value-objects/SKILL.md ("no behavior unrelated to the value" — un VO no
 * debe ser un namespace de una función de string genérica). Se extrae acá
 * para que tanto `Email.mask()` (dominio) como `sanitizeCausa()`
 * (`nodemailer-email-sender.adapter.ts`, infra) reusen la MISMA regla de
 * enmascarado sin que ninguno dependa del otro.
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
