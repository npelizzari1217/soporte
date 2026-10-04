import { BaseEntity } from '../../../shared/domain/base-entity';
import { Result } from '../../../shared/domain/result';
import { SolicitanteExternoInvalidoError } from '../errors/tickets.errors';

export const SOLICITANTE_EXTERNO_NOMBRE_MAX = 120;
export const SOLICITANTE_EXTERNO_EMAIL_MAX = 254;
export const SOLICITANTE_EXTERNO_TELEFONO_MAX = 30;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SolicitanteExternoProps {
  nombre: string;
  /** Email verificado del pedido, en minúsculas y sin espacios. */
  email: string;
  telefono: string | null;
  emailVerificadoAt: Date;
}

export interface CrearSolicitanteExternoInput {
  nombre: string;
  email: string;
  telefono?: string | null;
  emailVerificadoAt: Date;
}

/**
 * SolicitanteExternoEntity — quien pide por el formulario público sin tener cuenta.
 *
 * Es local al tenant: no hay `Usuario` ni `Membresia` ni nada suyo en master (D2). Se crea una fila
 * por pedido confirmado, sin deduplicar por email, así que no hay upsert ni atributos mezclados
 * entre pedidos. No tiene baja lógica: los datos se conservan mientras exista el ticket (D11).
 *
 * Dominio puro: sin Prisma ni NestJS.
 *
 * Ref spec: sdd/formulario-publico-qr solicitante-externo (D2, D11). Tarea: 6.2/6.3.
 */
export class SolicitanteExternoEntity extends BaseEntity<SolicitanteExternoProps> {
  private constructor(props: SolicitanteExternoProps, id?: string) {
    super(props, id);
  }

  /**
   * Valida y normaliza (trim; email en minúsculas; teléfono vacío pasa a null) y crea la entidad.
   * El email se verifica antes de llegar acá: `emailVerificadoAt` es obligatorio.
   */
  static create(
    input: CrearSolicitanteExternoInput,
    id?: string,
  ): Result<SolicitanteExternoEntity, SolicitanteExternoInvalidoError> {
    const nombre = input.nombre.trim();
    if (nombre.length === 0 || nombre.length > SOLICITANTE_EXTERNO_NOMBRE_MAX) {
      return Result.fail(
        new SolicitanteExternoInvalidoError(
          `el nombre debe tener entre 1 y ${SOLICITANTE_EXTERNO_NOMBRE_MAX} caracteres`,
        ),
      );
    }

    const email = input.email.trim().toLowerCase();
    if (email.length > SOLICITANTE_EXTERNO_EMAIL_MAX || !EMAIL_REGEX.test(email)) {
      return Result.fail(
        new SolicitanteExternoInvalidoError(
          `el email no tiene un formato válido (hasta ${SOLICITANTE_EXTERNO_EMAIL_MAX} caracteres)`,
        ),
      );
    }

    const telefonoLimpio = input.telefono?.trim() ?? '';
    if (telefonoLimpio.length > SOLICITANTE_EXTERNO_TELEFONO_MAX) {
      return Result.fail(
        new SolicitanteExternoInvalidoError(
          `el teléfono admite hasta ${SOLICITANTE_EXTERNO_TELEFONO_MAX} caracteres`,
        ),
      );
    }

    if (Number.isNaN(input.emailVerificadoAt.getTime())) {
      return Result.fail(
        new SolicitanteExternoInvalidoError('la fecha de verificación del email no es válida'),
      );
    }

    return Result.ok(
      new SolicitanteExternoEntity(
        {
          nombre,
          email,
          telefono: telefonoLimpio.length > 0 ? telefonoLimpio : null,
          emailVerificadoAt: input.emailVerificadoAt,
        },
        id,
      ),
    );
  }

  /** Reconstitución desde persistencia (mapper): los datos ya se validaron al guardarse. */
  static reconstitute(
    props: SolicitanteExternoProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
  ): SolicitanteExternoEntity {
    const entity = new SolicitanteExternoEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    return entity;
  }

  get nombre(): string {
    return this.props.nombre;
  }

  get email(): string {
    return this.props.email;
  }

  get telefono(): string | null {
    return this.props.telefono;
  }

  get emailVerificadoAt(): Date {
    return this.props.emailVerificadoAt;
  }
}
