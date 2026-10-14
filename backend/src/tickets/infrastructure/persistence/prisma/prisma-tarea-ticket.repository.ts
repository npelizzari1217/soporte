/**
 * PrismaTareaTicketRepository — implementación de `ITareaTicketRepository` sobre `tareas_ticket`,
 * con el cliente del inquilino de `TenantContext`.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { TareaTicketEntity } from '../../../domain/entities/tarea-ticket.entity';
import {
  CompletadasPorTecnico,
  CondicionDeCompletado,
  CondicionDeDescompletado,
  FiltroCompletadasPorTecnico,
  ITareaTicketRepository,
} from '../../../domain/ports/i-tarea-ticket.repository';
import { TareaTicketMapper } from './tarea-ticket.mapper';

const ORDEN_LISTADO = [{ orden: 'asc' as const }, { createdAt: 'asc' as const }];

@Injectable()
export class PrismaTareaTicketRepository implements ITareaTicketRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async listarPorTicket(ticketId: string): Promise<TareaTicketEntity[]> {
    const rows = await this.client.tareaTicket.findMany({
      where: { ticketId, deletedAt: null },
      orderBy: ORDEN_LISTADO,
    });
    return rows.map(TareaTicketMapper.toDomain);
  }

  /**
   * Un solo `findMany` para todo el lote, agrupado en memoria. Postgres devuelve la lista
   * ordenada globalmente; al recorrerla en ese orden, cada grupo conserva el orden por ticket.
   */
  async listarPorTickets(ticketIds: string[]): Promise<Map<string, TareaTicketEntity[]>> {
    const porTicket = new Map<string, TareaTicketEntity[]>();
    if (ticketIds.length === 0) return porTicket;

    const rows = await this.client.tareaTicket.findMany({
      where: { ticketId: { in: ticketIds }, deletedAt: null },
      orderBy: ORDEN_LISTADO,
    });
    for (const row of rows) {
      const tareas = porTicket.get(row.ticketId);
      if (tareas === undefined) porTicket.set(row.ticketId, [TareaTicketMapper.toDomain(row)]);
      else tareas.push(TareaTicketMapper.toDomain(row));
    }
    return porTicket;
  }

  async buscarPorId(id: string): Promise<TareaTicketEntity | null> {
    const row = await this.client.tareaTicket.findUnique({ where: { id } });
    return row ? TareaTicketMapper.toDomain(row) : null;
  }

  async crear(tarea: TareaTicketEntity): Promise<void> {
    await this.client.tareaTicket.create({ data: TareaTicketMapper.toPersistence(tarea) });
  }

  async completarSiPendiente(
    tarea: TareaTicketEntity,
    condicion: CondicionDeCompletado = {},
  ): Promise<boolean> {
    const { count } = await this.client.tareaTicket.updateMany({
      where: {
        id: tarea.id,
        deletedAt: null,
        completada: false,
        ...(condicion.tecnicoId !== undefined && { tecnicoId: condicion.tecnicoId }),
      },
      data: {
        completada: tarea.completada,
        completadaEn: tarea.completadaEn,
        completadaPorId: tarea.completadaPorId,
      },
    });
    return count === 1;
  }

  /**
   * `completadaEn` se compara contra el milisegundo leído, `[t, t + 1 ms)`: Postgres guarda
   * microsegundos y Prisma los trunca al leer, así que una igualdad exacta nunca aplicaría sobre
   * una fila escrita fuera de la aplicación.
   */
  async descompletarSiCompletada(
    tarea: TareaTicketEntity,
    condicion: CondicionDeDescompletado = {},
  ): Promise<boolean> {
    const { completadoLeido, tecnicoId } = condicion;
    const { count } = await this.client.tareaTicket.updateMany({
      where: {
        id: tarea.id,
        deletedAt: null,
        completada: true,
        ...(tecnicoId !== undefined && { tecnicoId }),
        ...(completadoLeido !== undefined && {
          completadaPorId: completadoLeido.completadaPorId,
          completadaEn: {
            gte: completadoLeido.completadaEn,
            lt: new Date(completadoLeido.completadaEn.getTime() + 1),
          },
        }),
      },
      data: {
        completada: tarea.completada,
        completadaEn: tarea.completadaEn,
        completadaPorId: tarea.completadaPorId,
      },
    });
    return count === 1;
  }

  async asignarTecnicoSiActiva(tarea: TareaTicketEntity): Promise<boolean> {
    const { count } = await this.client.tareaTicket.updateMany({
      where: { id: tarea.id, deletedAt: null },
      data: { tecnicoId: tarea.tecnicoId },
    });
    return count === 1;
  }

  async darDeBajaSiActiva(tarea: TareaTicketEntity): Promise<boolean> {
    const { count } = await this.client.tareaTicket.updateMany({
      where: { id: tarea.id, deletedAt: null },
      data: { deletedAt: tarea.deletedAt },
    });
    return count === 1;
  }

  async eliminar(id: string, ahora: Date): Promise<void> {
    await this.client.tareaTicket.update({ where: { id }, data: { deletedAt: ahora } });
  }

  async contarCompletadasPorTecnico(
    filtro: FiltroCompletadasPorTecnico,
  ): Promise<CompletadasPorTecnico[]> {
    const grupos = await this.client.tareaTicket.groupBy({
      by: ['completadaPorId'],
      where: {
        completada: true,
        deletedAt: null,
        completadaEn: { gte: filtro.desde, lt: filtro.hasta },
        ...(filtro.completadaPorId !== undefined && { completadaPorId: filtro.completadaPorId }),
        ticket: {
          deletedAt: null,
          ...(filtro.cicloId !== undefined && { cicloId: filtro.cicloId }),
        },
      },
      _count: { _all: true },
    });

    return grupos
      .filter((g): g is typeof g & { completadaPorId: string } => g.completadaPorId !== null)
      .map((g) => ({ completadaPorId: g.completadaPorId, completadas: g._count._all }))
      .sort(
        (a, b) =>
          b.completadas - a.completadas || a.completadaPorId.localeCompare(b.completadaPorId),
      );
  }
}
