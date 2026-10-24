/**
 * Ticket resuelto, cerrado o cancelado: solo comentarios (odd/cerrado-solo-comentarios, S1-S3, S6).
 * Espejo de `ticketSoloComentarios` de
 * `backend/src/tickets/domain/policies/solo-comentarios.policy.ts`: en esos estados, quien no es
 * ADMINISTRADOR ni ROOT solo comenta (ni campos, ni tareas, ni adjuntos, ni compras, ni
 * responsable). Es experiencia: el backend decide y su 422 llega como toast.
 */

/** Estados de solo comentarios, los mismos que `ESTADOS_SOLO_COMENTARIOS` del backend. */
export const ESTADOS_SOLO_COMENTARIOS = ["RESUELTO", "CERRADO", "CANCELADO"] as const;

type EstadoSoloComentarios = (typeof ESTADOS_SOLO_COMENTARIOS)[number];

const NOMBRE_ESTADO: Readonly<Record<EstadoSoloComentarios, string>> = {
  RESUELTO: "resuelto",
  CERRADO: "cerrado",
  CANCELADO: "cancelado",
};

function esEstadoSoloComentarios(estadoCodigo: string): estadoCodigo is EstadoSoloComentarios {
  return (ESTADOS_SOLO_COMENTARIOS as readonly string[]).includes(estadoCodigo);
}

/**
 * Por qué el actor solo puede comentar el ticket, o `null` si puede modificarlo.
 *
 * @param estadoCodigo Código del estado del ticket; `undefined` mientras el catálogo no resolvió
 *   (no se esconde nada por eso: decide el backend).
 * @param esAdministrador `true` para ADMINISTRADOR y ROOT (`useSession().esAdminCliente`), exentos.
 * @returns El motivo para mostrar, que nombra el estado, o `null`.
 */
export function motivoSoloComentarios(estadoCodigo: string | undefined, esAdministrador: boolean): string | null {
  if (esAdministrador || estadoCodigo === undefined || !esEstadoSoloComentarios(estadoCodigo)) return null;
  return `El ticket está ${NOMBRE_ESTADO[estadoCodigo]}: solo admite comentarios.`;
}

/**
 * ¿El actor solo puede comentar el ticket? Ver `motivoSoloComentarios`.
 *
 * @param estadoCodigo Código del estado del ticket, o `undefined` si el catálogo no resolvió.
 * @param esAdministrador `true` para ADMINISTRADOR y ROOT.
 * @returns `true` en RESUELTO, CERRADO o CANCELADO para quien no es administrador.
 */
export function ticketSoloComentariosUi(estadoCodigo: string | undefined, esAdministrador: boolean): boolean {
  return motivoSoloComentarios(estadoCodigo, esAdministrador) !== null;
}
