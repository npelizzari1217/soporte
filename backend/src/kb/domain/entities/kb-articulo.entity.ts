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

/**
 * Tope de largo de `titulo`, espejando `kbArticulos.titulo VarChar(255)`
 * (`prisma_master/schema.prisma`).
 *
 * Vive ACÁ y no en el DTO porque el dominio es la autoridad del límite: el
 * `VARCHAR` de Postgres es backstop, nunca al revés. `kb-articulo.dto.ts` lo
 * importa para que el 400 amable del borde y la precondición del dominio no
 * puedan divergir.
 *
 * `contenido` NO tiene tope, y no es un olvido: su columna es `@db.Text`, sin
 * límite. No hay nada que espejar.
 */
export const KB_TITULO_MAX_LENGTH = 255;

/**
 * Tope de largo de `slug`, espejando `kbArticulos.slug VarChar(120)`.
 *
 * `slug` NO es parte de `KbArticuloProps`: solo lo escribe el sincronizador de
 * la Ayuda (`scripts/sync-ayuda.js`), que es la identidad estable de los
 * artículos que viven como markdown en el repo. Pero la columna pertenece a
 * este agregado, así que su tope vive acá igual — si no, el único lugar donde
 * existiría el número sería un literal dentro de un script.
 *
 * Ese script es CommonJS y corre con `node` pelado, así que no puede importar
 * esta constante. Lo que impide que diverjan es un test:
 * `scripts/sync-ayuda.spec.ts` compara los topes que el script exporta contra
 * estos.
 */
export const KB_SLUG_MAX_LENGTH = 120;

/**
 * Valida `titulo`: no vacío y dentro del tope.
 *
 * Las dos condiciones van juntas a propósito. `create()` y `editar()` llaman
 * las dos a esta función, así que agregar un guard acá lo cubre en las dos
 * puertas — que es justo el defecto de "cobertura parcial" que este repo
 * arrastra: cerrar el alta y olvidar la edición.
 *
 * El vacío lanza un error de dominio tipado (`TituloVacioError`) porque es una
 * desviación de NEGOCIO que el usuario corrige; el largo lanza un `Error` plano
 * porque es violación de contrato del caller — el borde ya lo rechazó con un
 * 400, y `titulo` no se normaliza en ningún borde (rama 1 de la "regla de tres
 * ramas"). Mismo criterio que el resto de las entidades del repo.
 */
function assertTituloValido(titulo: string): void {
  if (titulo.trim().length === 0) {
    throw new TituloVacioError();
  }
  if (titulo.length > KB_TITULO_MAX_LENGTH) {
    throw new Error(`KbArticuloEntity: titulo excede ${KB_TITULO_MAX_LENGTH} caracteres.`);
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
   * @throws Error si `props.titulo` supera `KB_TITULO_MAX_LENGTH`.
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
   * @throws Error si `titulo` editado supera `KB_TITULO_MAX_LENGTH` — NO muta en ese caso.
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
