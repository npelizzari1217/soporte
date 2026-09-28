import { EmailMessage } from '../../../shared/domain/ports/i-email-sender';

/**
 * Estado del correo de un cliente: `LISTO` (existe, activo, SMTP
 * configurado), `SIN_CORREO` (existe y activo, sin SMTP) o
 * `CLIENTE_NO_DISPONIBLE` (no existe, inactivo o soft-deleted).
 */
export type EstadoCorreoCliente = 'LISTO' | 'SIN_CORREO' | 'CLIENTE_NO_DISPONIBLE';

/**
 * ICorreoDeCliente — puerto que resuelve si se puede mandar un mail a un
 * cliente (tenant) y lo envía dentro de su `TenantContext`. Dominio puro; la
 * implementación (`CorreoDeClienteAdapter`) vive en `auth/infrastructure/email/`,
 * la única capa que toca `PrismaService`/`TenantContext.run`.
 *
 * Ref spec: sdd/auth-reseteo-por-olvido/spec, Requirement "La solicitud de
 * reset devuelve una respuesta uniforme". Ref design: ADR-4. Tarea: 3.5.
 */
export interface ICorreoDeCliente {
  /** Resuelve el estado del correo del cliente. Nunca lanza. */
  estado(clienteId: string): Promise<EstadoCorreoCliente>;

  /** Envía `msg` dentro del `TenantContext` del `clienteId`. Nunca lanza. */
  enviar(clienteId: string, msg: EmailMessage): Promise<void>;
}

/** Token de inyección de dependencias para ICorreoDeCliente en NestJS. */
export const CORREO_DE_CLIENTE = Symbol('CORREO_DE_CLIENTE');
