import { BaseEntity } from '../../../shared/domain/base-entity';
import { Result } from '../../../shared/domain/result';
import { PEDIDO_PUBLICO_TTL_MS } from '../constants/pedido-publico.constants';
import { PedidoPendienteInvalidoError } from '../errors/publico.errors';

export const PEDIDO_NOMBRE_MAX = 120;
export const PEDIDO_EMAIL_MAX = 254;
export const PEDIDO_TELEFONO_MAX = 30;
export const PEDIDO_TITULO_MIN = 3;
export const PEDIDO_TITULO_MAX = 150;
export const PEDIDO_DESCRIPCION_MAX = 4000;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface PedidoPendienteProps {
  nombre: string;
  email: string;
  telefono: string | null;
  titulo: string;
  descripcion: string;
  /** Equipo ya resuelto desde el QR; null si el pedido llegó sin QR o el equipo ya no existe. */
  equipoId: string | null;
  expiresAt: Date;
}

export interface CrearPedidoPendienteInput {
  nombre: string;
  email: string;
  telefono?: string | null;
  titulo: string;
  descripcion: string;
  equipoId?: string | null;
  /** Instante de creación; por defecto, ahora. Inyectable para los tests. */
  ahora?: Date;
}

/**
 * PedidoPendienteEntity — pedido público aún sin verificar (TENANT, `pedidos_publicos_pendientes`).
 *
 * Es donde vive la PII del pedido (nombre, email, teléfono): master solo guarda el hash del token,
 * bajo el mismo id (ADR-7). No hay baja lógica: la fila se borra al confirmarse (DELETE RETURNING)
 * o al vencer (purga en la siguiente solicitud del tenant). Vence a las 24 h.
 *
 * Dominio puro: sin Prisma ni NestJS.
 *
 * Ref spec: sdd/formulario-publico-qr pedido-publico. Tarea: 11.2/11.3.
 */
export class PedidoPendienteEntity extends BaseEntity<PedidoPendienteProps> {
  private constructor(props: PedidoPendienteProps, id?: string) {
    super(props, id);
  }

  /** Valida, normaliza (trim; email en minúsculas; teléfono vacío a null) y fija el vencimiento a 24 h. */
  static create(
    input: CrearPedidoPendienteInput,
    id?: string,
  ): Result<PedidoPendienteEntity, PedidoPendienteInvalidoError> {
    const nombre = input.nombre.trim();
    if (nombre.length === 0 || nombre.length > PEDIDO_NOMBRE_MAX) {
      return Result.fail(
        new PedidoPendienteInvalidoError(
          `el nombre debe tener entre 1 y ${PEDIDO_NOMBRE_MAX} caracteres`,
        ),
      );
    }
    const email = input.email.trim().toLowerCase();
    if (email.length > PEDIDO_EMAIL_MAX || !EMAIL_REGEX.test(email)) {
      return Result.fail(new PedidoPendienteInvalidoError('el email no tiene un formato válido'));
    }
    const telefono = input.telefono?.trim() ?? '';
    if (telefono.length > PEDIDO_TELEFONO_MAX) {
      return Result.fail(
        new PedidoPendienteInvalidoError(
          `el teléfono admite hasta ${PEDIDO_TELEFONO_MAX} caracteres`,
        ),
      );
    }
    const titulo = input.titulo.trim();
    if (titulo.length < PEDIDO_TITULO_MIN || titulo.length > PEDIDO_TITULO_MAX) {
      return Result.fail(
        new PedidoPendienteInvalidoError(
          `el título debe tener entre ${PEDIDO_TITULO_MIN} y ${PEDIDO_TITULO_MAX} caracteres`,
        ),
      );
    }
    const descripcion = input.descripcion.trim();
    if (descripcion.length === 0 || descripcion.length > PEDIDO_DESCRIPCION_MAX) {
      return Result.fail(
        new PedidoPendienteInvalidoError(
          `la descripción debe tener entre 1 y ${PEDIDO_DESCRIPCION_MAX} caracteres`,
        ),
      );
    }

    const ahora = input.ahora ?? new Date();
    return Result.ok(
      new PedidoPendienteEntity(
        {
          nombre,
          email,
          telefono: telefono.length > 0 ? telefono : null,
          titulo,
          descripcion,
          equipoId: input.equipoId ?? null,
          expiresAt: new Date(ahora.getTime() + PEDIDO_PUBLICO_TTL_MS),
        },
        id,
      ),
    );
  }

  /** Reconstitución desde persistencia (mapper): los datos ya se validaron al guardarse. */
  static reconstitute(
    props: PedidoPendienteProps,
    id: string,
    createdAt: Date,
  ): PedidoPendienteEntity {
    const entity = new PedidoPendienteEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: createdAt });
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

  get titulo(): string {
    return this.props.titulo;
  }

  get descripcion(): string {
    return this.props.descripcion;
  }

  get equipoId(): string | null {
    return this.props.equipoId;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  /** `expiresAt <= ahora`: el instante exacto del vencimiento ya está vencido. */
  isExpired(ahora: Date = new Date()): boolean {
    return this.props.expiresAt.getTime() <= ahora.getTime();
  }
}
