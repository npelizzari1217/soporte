/**
 * PrismaTramoTecnicoRepository — implementación de `ITramoTecnicoRepository` sobre
 * `tramos_tecnico_ticket` y las lecturas de `tickets` y `operaciones_ticket` que necesita, en la
 * base del tenant activo (odd/tasks/tiempo-tecnico.md, T3).
 *
 * Toma el cliente de `TenantContext` en cada llamada: dentro de un `ITenantTransactionRunner.run()`
 * es el cliente transaccional, así que todo participa de la transacción que guarda el ticket.
 *
 * La tabla de tramos se lee y escribe con SQL crudo y parámetros: el cliente generado no se
 * regenera en el mismo cambio que agrega el modelo, y así el repositorio no depende de eso. Los
 * instantes viajan como ISO con `::timestamptz`, sin depender de la zona de la sesión.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../shared/infrastructure/persistence/prisma-clients';
import {
  CierreTramo,
  ITramoTecnicoRepository,
  SituacionTicketGuardado,
  TramoTecnico,
} from '../domain/ports/i-tramo-tecnico.repository';
import {
  CambioEstadoTramo,
  esMotivoFinTramo,
  MotivoFinTramo,
  TramoAbierto,
} from '../domain/tramo-tecnico';

interface FilaSituacion {
  asignado_id: string | null;
  estado_id: string;
  estado_codigo: string;
  sla_meta_s: number | null;
}

interface FilaTramo {
  id: string;
  ticket_id: string;
  tecnico_id: string;
  inicio_at: Date;
  fin_at: Date | null;
  motivo_fin: string | null;
  habil_s: number | null;
  meta_s: number | null;
  cumplido: boolean | null;
}

function motivoDe(fila: FilaTramo): MotivoFinTramo | null {
  if (fila.motivo_fin === null) return null;
  if (!esMotivoFinTramo(fila.motivo_fin)) {
    throw new Error(
      `tramos_tecnico_ticket inconsistente: motivo_fin "${fila.motivo_fin}" desconocido en el tramo "${fila.id}".`,
    );
  }
  return fila.motivo_fin;
}

@Injectable()
export class PrismaTramoTecnicoRepository implements ITramoTecnicoRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  /** Retorna el cliente Prisma del tenant activo. Lanza si no hay TenantContext activo. */
  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async leerSituacion(ticketId: string): Promise<SituacionTicketGuardado | null> {
    const filas = await this.client.$queryRaw<FilaSituacion[]>`
      SELECT t.asignado_id, t.estado_id, e.codigo AS estado_codigo, t.sla_meta_s
        FROM tickets t
        JOIN estados e ON e.id = t.estado_id
       WHERE t.id = ${ticketId}::uuid
         FOR NO KEY UPDATE OF t
    `;
    if (filas.length === 0) return null;
    const [fila] = filas;
    return {
      asignadoId: fila.asignado_id,
      estadoId: fila.estado_id,
      estadoCodigo: fila.estado_codigo,
      slaMetaS: fila.sla_meta_s,
    };
  }

  async obtenerAbierto(ticketId: string): Promise<TramoAbierto | null> {
    const filas = await this.client.$queryRaw<
      Array<{ id: string; tecnico_id: string; inicio_at: Date }>
    >`
      SELECT id, tecnico_id, inicio_at
        FROM tramos_tecnico_ticket
       WHERE ticket_id = ${ticketId}::uuid AND fin_at IS NULL
    `;
    if (filas.length === 0) return null;
    const [fila] = filas;
    return { id: fila.id, tecnicoId: fila.tecnico_id, inicioAt: fila.inicio_at };
  }

  async abrir(props: {
    ticketId: string;
    tecnicoId: string;
    inicioAt: Date;
  }): Promise<TramoAbierto> {
    const [fila] = await this.client.$queryRaw<Array<{ id: string }>>`
      INSERT INTO tramos_tecnico_ticket (ticket_id, tecnico_id, inicio_at, updated_at)
      VALUES (${props.ticketId}::uuid, ${props.tecnicoId}::uuid,
              ${props.inicioAt.toISOString()}::timestamptz, now())
      RETURNING id
    `;
    return { id: fila.id, tecnicoId: props.tecnicoId, inicioAt: props.inicioAt };
  }

  async cerrar(cierre: CierreTramo): Promise<boolean> {
    const actualizadas = await this.client.$executeRaw`
      UPDATE tramos_tecnico_ticket
         SET fin_at = ${cierre.finAt.toISOString()}::timestamptz,
             motivo_fin = ${cierre.motivo},
             habil_s = ${cierre.habilS}::integer,
             meta_s = ${cierre.metaS}::integer,
             cumplido = ${cierre.cumplido}::boolean,
             updated_at = now()
       WHERE id = ${cierre.id}::uuid AND fin_at IS NULL
    `;
    return actualizadas === 1;
  }

  async listarCambiosEstado(ticketId: string, hasta: Date): Promise<CambioEstadoTramo[]> {
    const operaciones = await this.client.operacionTicket.findMany({
      where: {
        ticketId,
        deletedAt: null,
        createdAt: { lte: hasta },
        tipoOperacion: { codigo: 'CAMBIO_ESTADO' },
        estadoNuevoId: { not: null },
      },
      select: { createdAt: true, estadoNuevo: { select: { codigo: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const cambios: CambioEstadoTramo[] = [];
    for (const operacion of operaciones) {
      if (operacion.estadoNuevo !== null) {
        cambios.push({ at: operacion.createdAt, estadoCodigo: operacion.estadoNuevo.codigo });
      }
    }
    return cambios;
  }

  async listarPorTicket(ticketId: string): Promise<TramoTecnico[]> {
    const filas = await this.client.$queryRaw<FilaTramo[]>`
      SELECT id, ticket_id, tecnico_id, inicio_at, fin_at, motivo_fin, habil_s, meta_s, cumplido
        FROM tramos_tecnico_ticket
       WHERE ticket_id = ${ticketId}::uuid
       ORDER BY inicio_at, created_at, id
    `;
    return filas.map((fila) => ({
      id: fila.id,
      ticketId: fila.ticket_id,
      tecnicoId: fila.tecnico_id,
      inicioAt: fila.inicio_at,
      finAt: fila.fin_at,
      motivoFin: motivoDe(fila),
      habilS: fila.habil_s,
      metaS: fila.meta_s,
      cumplido: fila.cumplido,
    }));
  }
}
