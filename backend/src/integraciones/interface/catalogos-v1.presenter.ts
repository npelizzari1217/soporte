import { EstadoEntity } from '../../tickets/domain/entities/estado.entity';
import { PrioridadEntity } from '../../tickets/domain/entities/prioridad.entity';
import { TipoTicketEntity } from '../../tickets/domain/entities/tipo-ticket.entity';
import { CatalogosV1 } from './catalogos-v1.dto';

/**
 * Proyecta los catalogos del tenant al contrato `v1` (lista blanca de campos). Solo presenta:
 * que tipos, prioridades y estados entran lo deciden los casos de uso que los listan.
 */
export function aCatalogosV1(
  tipos: TipoTicketEntity[],
  prioridades: PrioridadEntity[],
  estados: EstadoEntity[],
): CatalogosV1 {
  return {
    tipos: tipos.map((t) => ({ id: t.id, codigo: t.codigo, nombre: t.nombre })),
    prioridades: prioridades.map((p) => ({
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      orden: p.orden,
    })),
    estados: estados.map((e) => ({
      id: e.id,
      codigo: e.codigo,
      nombre: e.nombre,
      orden: e.orden,
    })),
  };
}
