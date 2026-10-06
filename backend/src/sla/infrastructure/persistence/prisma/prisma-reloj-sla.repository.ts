/**
 * PrismaRelojSlaRepository — implementa IRelojSlaRepository (sdd/sla-primera-respuesta-y-pausa, ADR-3).
 * Escritura acotada a las columnas del reloj; el orden del pliegue es `sla_reloj_seq`, nunca `created_at`.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IRelojSlaRepository } from '../../../domain/ports/i-reloj-sla.repository';
import {
  RelojSlaFila,
  RelojSlaResultado,
  TransicionReloj,
} from '../../../domain/entities/reloj-sla';

const CAMBIO_ESTADO = 'CAMBIO_ESTADO';
const SELECT_TRANSICION = {
  createdAt: true,
  estadoAnterior: { select: { codigo: true } },
  estadoNuevo: { select: { codigo: true } },
} as const;

interface OperacionLeida {
  createdAt: Date;
  estadoAnterior: { codigo: string } | null;
  estadoNuevo: { codigo: string } | null;
}

/** Tope de tickets marcados que un barrido reaplica: el resto queda marcado para el barrido siguiente. */
const LOTE_META_PENDIENTE = 200;

@Injectable()
export class PrismaRelojSlaRepository implements IRelojSlaRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  private aTransiciones(ops: OperacionLeida[]): TransicionReloj[] {
    return ops.flatMap((o) =>
      o.estadoNuevo
        ? [
            {
              createdAt: o.createdAt,
              estadoAnteriorCodigo: o.estadoAnterior?.codigo ?? null,
              estadoNuevoCodigo: o.estadoNuevo.codigo,
            },
          ]
        : [],
    );
  }

  async leer(ticketId: string): Promise<RelojSlaFila | null> {
    const t = await this.client.ticket.findFirst({
      where: { id: ticketId, deletedAt: null },
      select: {
        id: true,
        createdAt: true,
        slaRegla: true,
        slaVenceAt: true,
        slaAcumuladoS: true,
        slaMetaS: true,
        slaCorreDesde: true,
        slaRelojSeqHasta: true,
        slaRelojVersion: true,
        slaCumplido: true,
        estado: { select: { codigo: true } },
      },
    });
    if (!t) return null;
    return {
      ticketId: t.id,
      estadoCodigo: t.estado.codigo,
      slaRegla: t.slaRegla,
      createdAt: t.createdAt,
      slaVenceAt: t.slaVenceAt,
      acumuladoS: t.slaAcumuladoS,
      metaS: t.slaMetaS,
      correDesde: t.slaCorreDesde,
      seqHasta: t.slaRelojSeqHasta,
      version: t.slaRelojVersion,
      cumplido: t.slaCumplido,
    };
  }

  async historialSinSecuencia(ticketId: string): Promise<TransicionReloj[]> {
    const ops = await this.client.operacionTicket.findMany({
      where: {
        ticketId,
        deletedAt: null,
        slaRelojSeq: null,
        tipoOperacion: { codigo: CAMBIO_ESTADO },
      },
      select: SELECT_TRANSICION,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return this.aTransiciones(ops);
  }

  async transicionesDesde(ticketId: string, seqHasta: number): Promise<TransicionReloj[]> {
    const ops = await this.client.operacionTicket.findMany({
      where: {
        ticketId,
        deletedAt: null,
        slaRelojSeq: { gt: seqHasta },
        tipoOperacion: { codigo: CAMBIO_ESTADO },
      },
      select: SELECT_TRANSICION,
      orderBy: { slaRelojSeq: 'asc' },
    });
    return this.aTransiciones(ops);
  }

  async guardarSiVersion(
    ticketId: string,
    version: number,
    reloj: RelojSlaResultado,
    meta?: { prioridadAplicadaId: string },
  ): Promise<boolean> {
    const { count } = await this.client.ticket.updateMany({
      // Con meta aplicada, la prioridad vigente entra al WHERE: la reprioritización no versiona el
      // reloj, así que sin esto el CAS no vería un cambio de prioridad entre la lectura y la escritura.
      where: {
        id: ticketId,
        slaRelojVersion: version,
        ...(meta ? { prioridadId: meta.prioridadAplicadaId } : {}),
      },
      data: {
        slaAcumuladoS: reloj.acumuladoS,
        slaMetaS: reloj.metaS,
        slaCorreDesde: reloj.correDesde,
        slaCumplido: reloj.cumplido,
        ...(reloj.slaVenceAt !== undefined ? { slaVenceAt: reloj.slaVenceAt } : {}),
        slaRelojSeqHasta: version,
        slaRelojPendiente: false,
        ...(meta ? { slaMetaPendiente: false } : {}),
      },
    });
    return count === 1;
  }

  async limpiarMetaPendiente(ticketId: string): Promise<void> {
    await this.client.ticket.updateMany({
      where: { id: ticketId, slaMetaPendiente: true },
      data: { slaMetaPendiente: false },
    });
  }

  async findPendientes(): Promise<string[]> {
    const filas = await this.client.ticket.findMany({
      where: { slaRelojPendiente: true, deletedAt: null },
      select: { id: true },
    });
    return filas.map((f) => f.id);
  }

  async findMetaPendiente(): Promise<string[]> {
    const filas = await this.client.ticket.findMany({
      where: { slaMetaPendiente: true, deletedAt: null },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: LOTE_META_PENDIENTE,
    });
    return filas.map((f) => f.id);
  }
}
