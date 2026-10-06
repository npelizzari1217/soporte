/**
 * TicketMapper — convierte entre Prisma Ticket (fila de DB) y TicketEntity
 * (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Tarea: T5.1
 */
import type { Ticket as PrismaTicket } from '.prisma/tenant';
import { SLA_REGLAS, SlaRegla, TicketEntity } from '../../../domain/entities/ticket.entity';

/**
 * Valida y angosta el `string` crudo de la columna `sla_regla` (CHECK
 * `tickets_sla_regla_check`) al tipo de dominio `SlaRegla`. Un valor fuera
 * del catálogo cerrado es un dato corrupto/de un futuro no contemplado, no
 * una desviación de negocio — lanza en vez de angostar en silencio.
 */
function parseSlaRegla(value: string): SlaRegla {
  // Deriva de SLA_REGLAS en vez de repetir los literales: el catálogo se
  // declara una sola vez y el CHECK de la base se compara contra ese array.
  if ((SLA_REGLAS as readonly string[]).includes(value)) {
    return value as SlaRegla;
  }
  throw new Error(`TicketMapper: sla_regla con valor inesperado en la fila: "${value}".`);
}

/**
 * Columnas del reloj de SLA (M2): las escribe `sla/` y el marcador con escrituras acotadas, nunca el
 * upsert de la entidad. El `create` del repo fija `slaAcumuladoS` y `slaCorreDesde`.
 */
type ColumnasRelojSla =
  | 'slaAcumuladoS'
  | 'slaMetaS'
  | 'slaCorreDesde'
  | 'slaRelojSeqHasta'
  | 'slaRelojVersion'
  | 'slaRelojPendiente'
  | 'slaCumplido';

export class TicketMapper {
  /** Convierte una fila de DB Prisma → TicketEntity de dominio. */
  static toDomain(row: PrismaTicket): TicketEntity {
    return TicketEntity.reconstitute(
      {
        numero: row.numero,
        titulo: row.titulo,
        descripcion: row.descripcion ?? null,
        tipoId: row.tipoId,
        estadoId: row.estadoId,
        prioridadId: row.prioridadId,
        cicloId: row.cicloId ?? null,
        ticketReferenciaId: row.ticketReferenciaId ?? null,
        solicitanteId: row.solicitanteId ?? null,
        solicitanteExternoId: row.solicitanteExternoId ?? null,
        asignadoId: row.asignadoId ?? null,
        slaVenceAt: row.slaVenceAt ?? null,
        vencido: row.vencido,
        fechaCierre: row.fechaCierre ?? null,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
      parseSlaRegla(row.slaRegla),
      {
        acumuladoS: row.slaAcumuladoS ?? null,
        metaS: row.slaMetaS ?? null,
        correDesde: row.slaCorreDesde ?? null,
        seqHasta: row.slaRelojSeqHasta,
        version: row.slaRelojVersion,
        pendiente: row.slaRelojPendiente,
        cumplido: row.slaCumplido ?? null,
      },
    );
  }

  /**
   * Convierte TicketEntity → objeto plano para Prisma upsert. Incluye
   * `createdAt` para que el repo lo use en el CREATE y lo excluya del
   * UPDATE (nunca pisar el timestamp de creación existente en DB).
   *
   * `slaRegla` (sdd/sla-habil WU-3) queda deliberadamente AFUERA de este
   * objeto — no del tipo de retorno únicamente, tampoco se lee
   * `entity.slaRegla` acá. Ningún caso de uso elige esa columna — de dónde
   * sale su valor, ver {@link SlaRegla}: si este método la escribiera, un ticket recién
   * `create()`-ado (todavía sin persistir) haría lanzar el getter, y un
   * ticket reconstituido pisaría con código lo que es responsabilidad
   * exclusiva de la DB.
   */
  static toPersistence(
    entity: TicketEntity,
  ): Omit<PrismaTicket, 'updatedAt' | 'slaRegla' | ColumnasRelojSla> {
    return {
      id: entity.id,
      numero: entity.numero,
      titulo: entity.titulo,
      descripcion: entity.descripcion,
      tipoId: entity.tipoId,
      estadoId: entity.estadoId,
      prioridadId: entity.prioridadId,
      cicloId: entity.cicloId,
      ticketReferenciaId: entity.ticketReferenciaId,
      solicitanteId: entity.solicitanteId,
      solicitanteExternoId: entity.solicitanteExternoId,
      asignadoId: entity.asignadoId,
      slaVenceAt: entity.slaVenceAt,
      vencido: entity.vencido,
      fechaCierre: entity.fechaCierre,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
