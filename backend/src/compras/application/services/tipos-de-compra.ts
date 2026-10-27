import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';

/** Tipo de ticket de una compra, como lo publican las respuestas (odd/compras-por-tipo, L3). */
export interface TipoTicketDeCompra {
  id: string;
  nombre: string;
}

/**
 * ResolverTiposDeCompra — el nombre de los tipos de ticket de un conjunto de compras
 * (odd/compras-por-tipo, L3: "El nombre sale del tipo en la misma base del tenant").
 *
 * La entidad guarda solo `tipoTicketId`; el nombre es un dato del catálogo que cambia sin tocar la
 * compra, así que se resuelve al responder. Una lectura por tipo DISTINTO, no por compra: un
 * listado de 20 compras repartidas en tres tipos son tres lecturas. Va aparte del repositorio de
 * compras para no tocar el presupuesto de sentencias del listado (S32), que mide solo la página.
 * Un tipo dado de baja conserva su nombre: la compra sigue siendo de ese tipo.
 */
export class ResolverTiposDeCompra {
  constructor(private readonly tipoRepo: Pick<ITipoTicketRepository, 'findById'>) {}

  /**
   * @param tipoIds Tipos de las compras; los `null` (compras sin tipo) se ignoran.
   * @returns Mapa `tipoId` → tipo. Un id que el catálogo no tiene no entra al mapa.
   */
  async resolver(
    tipoIds: Iterable<string | null>,
  ): Promise<ReadonlyMap<string, TipoTicketDeCompra>> {
    const distintos = new Set<string>();
    for (const tipoId of tipoIds) {
      if (tipoId !== null) distintos.add(tipoId);
    }
    const tipos = new Map<string, TipoTicketDeCompra>();
    for (const tipoId of distintos) {
      const tipo = await this.tipoRepo.findById(tipoId);
      if (tipo) tipos.set(tipoId, { id: tipo.id, nombre: tipo.nombre });
    }
    return tipos;
  }
}

/**
 * El tipo de una compra a partir del mapa de `ResolverTiposDeCompra`. La FK impide que el tipo
 * falte en el catálogo; si aun así faltara, se publica su id como nombre antes que `null`, que
 * significaría "compra sin tipo" y la mostraría como visible para todos.
 *
 * @param tipoTicketId Tipo de la compra, o `null` si no tiene.
 * @param tipos Mapa resuelto.
 * @returns El tipo, o `null` para una compra sin tipo.
 */
export function tipoDeCompra(
  tipoTicketId: string | null,
  tipos: ReadonlyMap<string, TipoTicketDeCompra>,
): TipoTicketDeCompra | null {
  if (tipoTicketId === null) return null;
  return tipos.get(tipoTicketId) ?? { id: tipoTicketId, nombre: tipoTicketId };
}
