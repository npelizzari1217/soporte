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

/**
 * Detecta direcciones de email embebidas en texto libre (rechazos SMTP,
 * mensajes de error de una capa inferior, etc.).
 *
 * El dominio acepta 1+ etiquetas (`(?:\.[\w-]+)*` — cero o más repeticiones
 * de un punto seguido de una etiqueta sin puntos) en vez de exigir un punto
 * literal: `no-reply@localhost` es una dirección real y común en entornos
 * de test/dev (ver `backend/test/setup-env.ts`, `SMTP_HOST='localhost'`) que
 * la versión anterior del regex dejaba SIN enmascarar (Judgment Day PR3
 * Ronda 3, issue 3). Los grupos son disjuntos (la clase inicial no incluye
 * `.`, y cada repetición exige un `.` literal antes del siguiente tramo) —
 * sin cuantificadores anidados solapados, así que no hay riesgo de
 * catastrophic backtracking.
 */
const EMAIL_IN_TEXT = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*/g;

/**
 * Enmascara cualquier email en claro EMBEBIDO dentro de un texto arbitrario,
 * preservando intacto el resto del texto — a diferencia de `maskEmailLike()`,
 * que asume que el string COMPLETO es una dirección de email (usarlo sobre
 * texto libre mutilaría el mensaje: todo lo que precede al primer `@` se
 * reemplaza por un solo caracter).
 *
 * Reusa `maskEmailLike()` por cada ocurrencia encontrada, así que ambas
 * funciones aplican la MISMA regla de enmascarado (Judgment Day PR3 Ronda 2,
 * issue 3 Juez A: última red de seguridad del listener de eventos, que no
 * puede confiar en que un `Error` de una capa inferior ya venga sin PII).
 */
export function maskEmailsInText(text: string): string {
  return text.replace(EMAIL_IN_TEXT, (match) => maskEmailLike(match));
}
