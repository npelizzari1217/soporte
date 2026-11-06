import { CertificadoAvanceEntity } from '../entities/certificado-avance.entity';

/**
 * Persistencia de los certificados de avance (odd/edilicia-obra-externa, T3b). Las escrituras
 * corren dentro de la transacción del caso de uso, con el lock del ticket tomado.
 */
export interface ICertificadoAvanceRepository {
  /** Certificados del ticket, vigentes y anulados, por número. */
  listarPorTicket(ticketId: string): Promise<CertificadoAvanceEntity[]>;

  /** El certificado, o `null` si no existe. */
  buscarPorId(id: string): Promise<CertificadoAvanceEntity | null>;

  /** Ids de las tareas del ticket que están en un certificado vigente (S5). */
  tareasCertificadas(ticketId: string): Promise<Set<string>>;

  /** Próximo correlativo del ticket: el mayor emitido más uno, o 1. */
  siguienteNumero(ticketId: string): Promise<number>;

  /** Inserta el certificado y sus tareas vigentes. */
  crear(certificado: CertificadoAvanceEntity): Promise<void>;

  /** Persiste la anulación y marca sus tareas como no vigentes. */
  anular(certificado: CertificadoAvanceEntity): Promise<void>;
}

export const CERTIFICADO_AVANCE_REPOSITORY = Symbol('CERTIFICADO_AVANCE_REPOSITORY');
