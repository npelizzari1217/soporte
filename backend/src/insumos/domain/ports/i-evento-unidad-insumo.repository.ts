import { EventoUnidadInsumoEntity } from '../entities/evento-unidad-insumo.entity';

/**
 * IEventoUnidadInsumoRepository — puerto de la bitácora append-only de las
 * unidades por número de serie (sdd/repuestos-numero-de-serie, ADR-9).
 *
 * Solo tiene `insert` y `listarPorUnidad`: la tabla no admite UPDATE ni DELETE
 * por diseño, así que el puerto no los expone. Definido en el dominio, sin
 * imports de Prisma ni de NestJS. No toma locks: participa de la transacción
 * del llamador (`OperacionesUnidadInsumo`), que ya tiene tomado L3.
 */
export interface IEventoUnidadInsumoRepository {
  /**
   * Asienta un evento. Conserva el id que la entidad ya generó en memoria: la
   * instalación lo necesita para fijar el `componenteId` de otros eventos
   * antes de insertar el componente (ADR-9, ADR-12).
   *
   * @param evento Evento de dominio nuevo.
   * @throws Error (P2002 de Prisma) si el `movimientoId` ya originó otro evento.
   */
  insert(evento: EventoUnidadInsumoEntity): Promise<void>;

  /**
   * Lista la historia de una unidad en orden cronológico, desempatando por id
   * (UUIDv7, monótono) cuando dos eventos comparten `created_at`.
   *
   * @param unidadId Id de la unidad.
   * @returns Los eventos de la unidad, del más antiguo al más reciente; vacío si no tiene historia.
   */
  listarPorUnidad(unidadId: string): Promise<EventoUnidadInsumoEntity[]>;
}

export const EVENTO_UNIDAD_INSUMO_REPOSITORY = Symbol('EVENTO_UNIDAD_INSUMO_REPOSITORY');
