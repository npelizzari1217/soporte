/**
 * Qué tipos de ticket se pueden abrir a mano (odd/ticket-unificado, S2, S6): espejo de
 * `admiteAltaManual` (`backend/src/tickets/domain/tipos-ticket.constants.ts`), la regla que aplican
 * por igual `POST /tickets` y `POST /reparaciones`. Un tipo de un módulo con alta de tipo (TICKETS,
 * EDILICIA) que no sea PREVENTIVO; cualquier otro responde 422. Las dos altas con selector de tipo
 * («Nuevo ticket» y «Nueva reparación») ofrecen esto mismo, filtrado además por `ALTAS`.
 */
import { MODULOS_CON_ALTA_DE_TIPO, TIPO_CODIGO_PREVENTIVO } from "@/features/catalogos/tipos-del-sistema";
import type { AccionTipoTicket } from "@/shared/auth/permisos-por-tipo";

/**
 * ¿Se puede abrir a mano un ticket de este tipo?
 *
 * @param tipo Código y módulo del tipo.
 * @returns `true` si el backend admite su alta manual.
 */
export function admiteAltaManual(tipo: { codigo: string; modulo: string }): boolean {
  return MODULOS_CON_ALTA_DE_TIPO.includes(tipo.modulo) && tipo.codigo !== TIPO_CODIGO_PREVENTIVO;
}

/**
 * ¿La sesión tiene `ALTAS` sobre algún tipo de un módulo con alta de tipo? Decide si se muestra el
 * botón de alta antes de que el catálogo cargue; con el catálogo, el diálogo se esconde si ningún
 * tipo resulta elegible (por ejemplo, `ALTAS` solo sobre PREVENTIVO).
 *
 * @param puedeEnModulo El predicado de `usePermisosPorTipo`.
 * @returns `true` si algún módulo con alta de tipo tiene `ALTAS`.
 */
export function puedeAltaManualEnAlgunModulo(
  puedeEnModulo: (modulo: string, accion: AccionTipoTicket) => boolean,
): boolean {
  return MODULOS_CON_ALTA_DE_TIPO.some((modulo) => puedeEnModulo(modulo, "ALTAS"));
}
