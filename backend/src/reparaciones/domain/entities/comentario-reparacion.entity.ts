import { BaseEntity } from '../../../shared/domain/base-entity';

/** Largo máximo del texto de un comentario. Espeja el CHECK de DB `comentarios_reparacion_texto_check`. */
export const COMENTARIO_TEXTO_MAX_LENGTH = 2000;

/**
 * ComentarioReparacionProps — shape de las propiedades de un comentario a
 * nivel de reparación. Sin imports de Prisma ni NestJS — dominio puro.
 */
export interface ComentarioReparacionProps {
  /** UUID del `ticket_edilicia` (la reparación) al que pertenece el comentario. */
  ticketEdiliciaId: string;
  /** Cuerpo del comentario, ya recortado. No vacío, hasta 2000 caracteres. */
  texto: string;
  /** Soft ref → master.usuarios.id. Quién escribió el comentario (JWT.sub). */
  autorId: string;
}

/**
 * ComentarioReparacionEntity — nota del operador sobre una reparación
 * edilicia (ej. "falta el repuesto X"), a nivel de la REPARACIÓN y no de cada
 * subtarea.
 *
 * APPEND-ONLY: una vez creado, el comentario no se edita ni se borra. No hay
 * mutadores de negocio, y `softDelete()`/`touch()` heredados de `BaseEntity`
 * no tienen contraparte en la tabla (`comentarios_reparacion` no tiene
 * `updated_at` ni `deleted_at`) — la firma del puerto
 * `IComentarioReparacionRepository` tampoco expone `update`/`delete`.
 *
 * El id lo genera `BaseEntity` (UUIDv7), no la DB — mismo criterio que el
 * resto de las entidades de `reparaciones/`.
 */
export class ComentarioReparacionEntity extends BaseEntity<ComentarioReparacionProps> {
  private constructor(props: ComentarioReparacionProps, id?: string) {
    super(props, id);
  }

  /**
   * Factory de un comentario nuevo. Recorta el texto y valida sus
   * invariantes.
   *
   * @param params.ticketEdiliciaId UUID del `ticket_edilicia` comentado.
   * @param params.texto            Cuerpo del comentario (se persiste recortado).
   * @param params.autorId          UUID del autor (soft ref master.usuarios).
   * @param id                      UUID opcional. Si no se provee, se genera UUIDv7.
   * @throws Error si el texto es vacío/solo whitespace, excede el máximo, o
   *         falta `ticketEdiliciaId`/`autorId`.
   */
  static create(
    params: { ticketEdiliciaId: string; texto: string; autorId: string },
    id?: string,
  ): ComentarioReparacionEntity {
    const texto = ComentarioReparacionEntity.validarTexto(params.texto);
    if (!params.ticketEdiliciaId || params.ticketEdiliciaId.trim().length === 0) {
      throw new Error('ComentarioReparacionEntity: ticketEdiliciaId es obligatorio.');
    }
    if (!params.autorId || params.autorId.trim().length === 0) {
      throw new Error('ComentarioReparacionEntity: autorId es obligatorio.');
    }

    return new ComentarioReparacionEntity(
      { ticketEdiliciaId: params.ticketEdiliciaId, texto, autorId: params.autorId },
      id,
    );
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura). NO
   * re-valida — los datos ya pasaron por `create()` al persistirse (mismo
   * criterio que `CompraEntity.reconstitute`), y el CHECK de DB los sostiene.
   *
   * Sin `updatedAt`/`deletedAt` en la firma, a diferencia del resto de las
   * entidades: la tabla es append-only y no tiene esas columnas. `updatedAt`
   * se espeja de `createdAt` para no inventar un dato que la DB no guarda.
   */
  static reconstitute(
    props: ComentarioReparacionProps,
    id: string,
    createdAt: Date,
  ): ComentarioReparacionEntity {
    const entity = new ComentarioReparacionEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: createdAt });
    entity._deletedAt = null;
    return entity;
  }

  /**
   * Precondición de dominio de `create()`: el texto, ya recortado, no puede
   * ser vacío ni exceder `COMENTARIO_TEXTO_MAX_LENGTH`.
   *
   * Modelada con `throw` y no con `Result.fail` a propósito: es una
   * precondición, no un fallo esperado del flujo — el `ValidationPipe` global
   * ya rechaza estos casos en el borde HTTP (`CreateComentarioReparacionDto`),
   * así que llegar acá con un texto inválido es un bug del caller. Mismo
   * criterio que `CompraEntity.validarCamposBase`.
   *
   * @returns El texto recortado, que es lo que se persiste.
   */
  private static validarTexto(texto: string): string {
    const recortado = (texto ?? '').trim();
    if (recortado.length === 0) {
      throw new Error('ComentarioReparacionEntity: texto es obligatorio.');
    }
    if (recortado.length > COMENTARIO_TEXTO_MAX_LENGTH) {
      throw new Error(
        `ComentarioReparacionEntity: texto excede ${COMENTARIO_TEXTO_MAX_LENGTH} caracteres (recibido: ${recortado.length}).`,
      );
    }
    return recortado;
  }

  // ─── Getters (solo lectura — la entidad es inmutable) ─────────────────────

  get ticketEdiliciaId(): string {
    return this.props.ticketEdiliciaId;
  }

  get texto(): string {
    return this.props.texto;
  }

  get autorId(): string {
    return this.props.autorId;
  }
}
