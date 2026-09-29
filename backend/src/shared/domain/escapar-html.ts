/**
 * Escapa un valor para interpolarlo dentro del `html` de una plantilla de
 * email. Se aplica a TODA interpolación del `html` (incluido el contexto de
 * atributo, `href="${link}"`), nunca al `text` (ahí el escapado sería el bug).
 *
 * Movida a `shared/domain` (sdd/reseteo-contrasena-olvidada WU-3) desde
 * `notificaciones/domain/templates/email-templates.ts`, su único consumidor
 * hasta que `auth/domain/templates/reset-password-email.template.ts` pasó a
 * necesitarla también.
 *
 * @param valor Texto a interpolar en el `html`.
 * @returns El mismo texto con `& < > " '` convertidos a entidades.
 */
export function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;') // primero, o re-escaparía las entidades de abajo
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
