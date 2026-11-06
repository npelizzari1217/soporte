import { BaseEntity } from '../../../shared/domain/base-entity';
import { DomainError, Result } from '../../../shared/domain/result';
import { CertificadoYaAnuladoError } from '../errors/certificados.errors';

/** Tope del motivo de anulación, en caracteres. */
export const MOTIVO_ANULACION_MAX_LENGTH = 2000;

/** Una tarea dentro de un certificado, con la COPIA de su peso al emitir (S8). */
export interface TareaDeCertificado {
  tareaId: string;
  peso: number;
}

export interface CertificadoAvanceProps {
  ticketId: string;
  /** Correlativo por ticket. */
  numero: number;
  /** Suma de los pesos copiados. */
  porcentaje: number;
  emitidoPorId: string;
  emitidoEn: Date;
  anuladoEn: Date | null;
  anuladoPorId: string | null;
  motivoAnulacion: string | null;
  tareas: TareaDeCertificado[];
}

/**
 * CertificadoAvanceEntity — certificado de avance de obra de un ticket EXTERNA
 * (odd/edilicia-obra-externa, S5, S6, S8). Agrupa tareas completadas y vale la suma de sus pesos,
 * calculada al emitir: el porcentaje no se carga a mano. Las reglas que miran el ticket y sus
 * tareas (modalidad, suma de 100, completadas, una sola vigente) las aplica el caso de uso con el
 * lock del ticket; esta entidad sostiene su propio invariante: anulación atómica y una sola vez.
 */
export class CertificadoAvanceEntity extends BaseEntity<CertificadoAvanceProps> {
  private constructor(props: CertificadoAvanceProps, id?: string) {
    super(props, id);
  }

  /**
   * Emite un certificado vigente. Las tareas llegan ya validadas por el caso de uso; una lista
   * vacía es una violación de precondición (el DTO exige al menos una).
   *
   * @param params Ticket, correlativo, emisor, instante y tareas con su peso copiado.
   * @returns El certificado, con `porcentaje` = suma de los pesos.
   */
  static emitir(params: {
    ticketId: string;
    numero: number;
    emitidoPorId: string;
    emitidoEn: Date;
    tareas: TareaDeCertificado[];
  }): CertificadoAvanceEntity {
    if (params.tareas.length === 0) {
      throw new Error('CertificadoAvanceEntity: un certificado necesita al menos una tarea.');
    }
    return new CertificadoAvanceEntity({
      ticketId: params.ticketId,
      numero: params.numero,
      porcentaje: params.tareas.reduce((suma, tarea) => suma + tarea.peso, 0),
      emitidoPorId: params.emitidoPorId,
      emitidoEn: params.emitidoEn,
      anuladoEn: null,
      anuladoPorId: null,
      motivoAnulacion: null,
      tareas: params.tareas.map((tarea) => ({ ...tarea })),
    });
  }

  /** Reconstitución desde persistencia: no revalida, la fila ya pasó sus CHECKs. */
  static reconstitute(
    props: CertificadoAvanceProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
  ): CertificadoAvanceEntity {
    const entity = new CertificadoAvanceEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    return entity;
  }

  get ticketId(): string {
    return this.props.ticketId;
  }

  get numero(): number {
    return this.props.numero;
  }

  get porcentaje(): number {
    return this.props.porcentaje;
  }

  get emitidoPorId(): string {
    return this.props.emitidoPorId;
  }

  get emitidoEn(): Date {
    return this.props.emitidoEn;
  }

  get anuladoEn(): Date | null {
    return this.props.anuladoEn;
  }

  get anuladoPorId(): string | null {
    return this.props.anuladoPorId;
  }

  get motivoAnulacion(): string | null {
    return this.props.motivoAnulacion;
  }

  /** `true` mientras no esté anulado. */
  get vigente(): boolean {
    return this.props.anuladoEn === null;
  }

  get tareas(): readonly TareaDeCertificado[] {
    return this.props.tareas;
  }

  /**
   * Anula el certificado (S8): libera sus tareas y queda como registro. El motivo llega validado
   * por el DTO (al menos un carácter visible); uno en blanco es una violación de precondición.
   *
   * @param porId Quien anula.
   * @param motivo Motivo de la anulación.
   * @param ahora Instante de la anulación.
   * @returns Ok, o `CertificadoYaAnuladoError` si ya estaba anulado.
   */
  anular(porId: string, motivo: string, ahora: Date): Result<void, DomainError> {
    if (motivo.trim().length === 0 || motivo.length > MOTIVO_ANULACION_MAX_LENGTH) {
      throw new Error('CertificadoAvanceEntity: motivo de anulación vacío o demasiado largo.');
    }
    if (!this.vigente) return Result.fail(new CertificadoYaAnuladoError(this.props.numero));
    this.props.anuladoEn = ahora;
    this.props.anuladoPorId = porId;
    this.props.motivoAnulacion = motivo;
    this.touch(ahora);
    return Result.ok(undefined);
  }
}
