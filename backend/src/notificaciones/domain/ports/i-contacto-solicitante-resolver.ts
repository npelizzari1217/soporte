import { ContactoUsuario } from './i-usuario-contacto-resolver';

/** Referencia al solicitante de un ticket: exactamente uno de los dos ids viene informado. */
export interface SolicitanteDeTicket {
  solicitanteId: string | null;
  solicitanteExternoId: string | null;
}

/** Contacto del solicitante, con la marca de si es un externo (sin cuenta ni acceso a la app). */
export type ContactoSolicitante = ContactoUsuario & { esExterno: boolean };

/**
 * IContactoSolicitanteResolver — puerto que resuelve email y nombre del solicitante de un ticket,
 * sea un usuario registrado (master) o un solicitante externo (tenant). Los eventos de dominio no
 * llevan PII: este puerto es el único punto donde los listeners de ticket obtienen el contacto.
 *
 * Ref spec: sdd/formulario-publico-qr solicitante-externo, requisito D5. Tarea: 9.2.
 */
export interface IContactoSolicitanteResolver {
  /** Devuelve null si el solicitante ya no existe o no tiene contacto: el listener omite el envío. */
  resolver(ticket: SolicitanteDeTicket): Promise<ContactoSolicitante | null>;
}

/** Token de inyección de dependencias para IContactoSolicitanteResolver en NestJS. */
export const CONTACTO_SOLICITANTE_RESOLVER = Symbol('CONTACTO_SOLICITANTE_RESOLVER');
