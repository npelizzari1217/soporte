import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * RespuestaPredefinidaProps — propiedades de una respuesta predefinida de soporte
 * (roadmap segunda etapa, punto 4; issue #368). Texto reutilizable que el usuario inserta en
 * el comentario de un ticket. Compartida por cliente: no hay respuestas personales.
 */
export interface RespuestaPredefinidaProps {
  titulo: string;
  texto: string;
  activo: boolean;
}

/**
 * Topes de largo, espejando `respuestas_predefinidas.titulo VarChar(100)` y `texto
 * VarChar(4000)` (y sus CHECK en la migración). Viven acá porque el dominio es la autoridad
 * del límite: el DTO los importa para que el 400 del borde y la precondición no diverjan.
 */
export const RESPUESTA_TITULO_MAX_LENGTH = 100;
export const RESPUESTA_TEXTO_MAX_LENGTH = 4000;

/**
 * Precondición de largo (1..max). Va como `throw` y no como `Result`: un primitivo fuera de
 * rango llegando a la entidad es violación de contrato del caller. NO se aplica en
 * `reconstitute()`: la fila ya existe y una lectura no debe explotar por un dato histórico.
 */
function validarLargos(titulo?: string, texto?: string): void {
  if (titulo !== undefined && (titulo.length < 1 || titulo.length > RESPUESTA_TITULO_MAX_LENGTH)) {
    throw new Error(
      `RespuestaPredefinidaEntity: titulo debe tener entre 1 y ${RESPUESTA_TITULO_MAX_LENGTH} caracteres.`,
    );
  }
  if (texto !== undefined && (texto.length < 1 || texto.length > RESPUESTA_TEXTO_MAX_LENGTH)) {
    throw new Error(
      `RespuestaPredefinidaEntity: texto debe tener entre 1 y ${RESPUESTA_TEXTO_MAX_LENGTH} caracteres.`,
    );
  }
}

/**
 * RespuestaPredefinidaEntity — respuesta reutilizable del catálogo del tenant. Se desactiva,
 * nunca se borra: una desactivada deja de ofrecerse en el selector del comentario pero sigue
 * en el ABM para poder reactivarla.
 */
export class RespuestaPredefinidaEntity extends BaseEntity<RespuestaPredefinidaProps> {
  /** @throws Error si `titulo` o `texto` están fuera de rango. */
  static create(props: RespuestaPredefinidaProps, id?: string): RespuestaPredefinidaEntity {
    validarLargos(props.titulo, props.texto);
    return new RespuestaPredefinidaEntity(props, id);
  }

  /** Rehidrata desde persistencia, preservando id y timestamps. No valida largos. */
  static reconstitute(
    props: RespuestaPredefinidaProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
  ): RespuestaPredefinidaEntity {
    const entity = new RespuestaPredefinidaEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    return entity;
  }

  get titulo(): string {
    return this.props.titulo;
  }

  get texto(): string {
    return this.props.texto;
  }

  get activo(): boolean {
    return this.props.activo;
  }

  /**
   * Actualiza los campos editables (PATCH semántico — `undefined` no toca el campo). La
   * unicidad de `titulo` se valida en la capa de aplicación.
   */
  actualizar(datos: { titulo?: string; texto?: string }): void {
    validarLargos(datos.titulo, datos.texto);
    if (datos.titulo !== undefined) {
      this.props.titulo = datos.titulo;
    }
    if (datos.texto !== undefined) {
      this.props.texto = datos.texto;
    }
    this.touch();
  }

  /** Deja de ofrecerla en el selector. NO es soft delete: la fila sigue visible en el ABM. */
  desactivar(): void {
    this.props.activo = false;
    this.touch();
  }

  /** Vuelve a ofrecerla. */
  activar(): void {
    this.props.activo = true;
    this.touch();
  }
}
