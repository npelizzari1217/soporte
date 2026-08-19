import { BaseEntity } from '../../../shared/domain/base-entity';
import { TituloVacioError, ContenidoVacioError } from '../errors/kb.errors';

/**
 * KbArticuloProps — shape de las propiedades de dominio de `KbArticulo`.
 * Sin imports de Prisma ni NestJS — dominio puro.
 */
export interface KbArticuloProps {
  titulo: string;
  contenido: string;
  /** Soft ref → usuarios.id (autor). Nullable — los artículos del repositorio no tienen autor. */
  autorId: string | null;
  /** default false — interno (solo staff); true = visible también al solicitante (K2). */
  visibleParaSolicitante: boolean;
  activo: boolean;
}

function assertTituloValido(titulo: string): void {
  if (titulo.trim().length === 0) {
    throw new TituloVacioError();
  }
}

function assertContenidoValido(contenido: string): void {
  if (contenido.trim().length === 0) {
    throw new ContenidoVacioError();
  }
}

/**
 * KbArticuloEntity — artículo de la Ayuda. ÚNICO y GLOBAL para todo el
 * sistema: vive en la DB master, no en la del cliente.
 *
 * Escritura reservada a ROOT (`GlobalAdminGuard` en `KbController`); lectura
 * filtrada por `KB:VER_TODOS` (sin esa celda solo se ven los publicados y
 * activos).
 *
 * Sin `tipoTicketId`: la FK apuntaba al catálogo `tipos_ticket` del TENANT y
 * no sobrevive al cruce a master.
 *
 * Ref spec: sdd/premium/spec K1, K2. Ref design: ADR-P6. Tarea: K1/K2.
 */
export class KbArticuloEntity extends BaseEntity<KbArticuloProps> {
  /**
   * Factory method para nuevas instancias de dominio.
   * @throws TituloVacioError si `props.titulo` es vacío/blank.
   * @throws ContenidoVacioError si `props.contenido` es vacío/blank.
   */
  static create(props: KbArticuloProps, id?: string): KbArticuloEntity {
    assertTituloValido(props.titulo);
    assertContenidoValido(props.contenido);
    return new KbArticuloEntity(props, id);
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura). No
   * revalida invariantes — se asume que la fila persistida ya es válida.
   */
  static reconstitute(
    props: KbArticuloProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): KbArticuloEntity {
    const entity = new KbArticuloEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get titulo(): string {
    return this.props.titulo;
  }

  get contenido(): string {
    return this.props.contenido;
  }

  get autorId(): string | null {
    return this.props.autorId;
  }

  get visibleParaSolicitante(): boolean {
    return this.props.visibleParaSolicitante;
  }

  get activo(): boolean {
    return this.props.activo;
  }

  // ─── Comportamiento de dominio (K1/K2) ────────────────────────────────────

  /**
   * Edita `titulo`/`contenido` (K1). Campos `undefined` NO se tocan (PATCH
   * semántico).
   * @throws TituloVacioError si `titulo` editado es vacío/blank — NO muta en ese caso.
   * @throws ContenidoVacioError si `contenido` editado es vacío/blank — NO muta en ese caso.
   */
  editar(datos: { titulo?: string; contenido?: string }): void {
    if (datos.titulo !== undefined) {
      assertTituloValido(datos.titulo);
    }
    if (datos.contenido !== undefined) {
      assertContenidoValido(datos.contenido);
    }

    if (datos.titulo !== undefined) {
      this.props.titulo = datos.titulo;
    }
    if (datos.contenido !== undefined) {
      this.props.contenido = datos.contenido;
    }
    this.touch();
  }

  /**
   * Alterna la visibilidad para el solicitante (K2). `true` = "publicar"
   * (visible también en el portal de autoservicio); `false` = "despublicar"
   * (solo staff).
   */
  publicar(visible: boolean): void {
    this.props.visibleParaSolicitante = visible;
    this.touch();
  }

  /**
   * Baja lógica del artículo (K1: "eliminar"): soft delete (`deletedAt`) +
   * `activo=false` (mismo patrón que `PrioridadEntity.desactivar()`).
   */
  eliminar(): void {
    this.props.activo = false;
    this.softDelete();
  }
}
