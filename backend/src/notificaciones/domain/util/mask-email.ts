/**
 * maskEmail — enmascara una dirección de email para uso en logs (N5).
 *
 * Formato: primer carácter del local-part + `***` + `@` + primer carácter
 * del dominio + `***` + resto del dominio tras el primer `.` (preserva el
 * TLD/subdominios para debug sin exponer el nombre completo). Ej.:
 * `juan@dominio.com` → `j***@d***.com`.
 *
 * Entradas inválidas (sin `@`, string vacío) devuelven `'***'` — nunca se
 * expone el valor original.
 *
 * Ref spec: sdd/premium/spec N5. Tarea: N1/N2.
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) {
    return '***';
  }

  const [local, domain] = email.split('@');
  const maskedLocal = local.length > 0 ? `${local[0]}***` : '***';

  const [domainName, ...domainRestParts] = domain.split('.');
  const domainRest = domainRestParts.join('.');
  const maskedDomain = domainName && domainName.length > 0 ? `${domainName[0]}***` : '***';

  return `${maskedLocal}@${maskedDomain}${domainRest ? `.${domainRest}` : ''}`;
}
