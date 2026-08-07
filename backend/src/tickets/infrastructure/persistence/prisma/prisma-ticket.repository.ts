/**
 * PrismaTicketRepository — implementación del puerto ITicketRepository.
 *
 * Reglas:
 * - Obtiene el cliente Prisma del tenant activo vía TenantContext.getClient().
 *   NUNCA recibe PrismaService ni llama a PrismaService directamente.
 * - Mapea Prisma rows ↔ TicketEntity vía TicketMapper.
 * - save() es un upsert por id (INSERT si nuevo, UPDATE si existe); nunca
 *   pisa `createdAt` en el UPDATE.
 * - delete() es soft delete: setea deleted_at = now().
 * - findLastSecuencia() (ADR-5): parsea la secuencia del campo `numero`
 *   (formato `{PREFIJO}-{AÑO}-{SEQ5}`) para el (tipoId, año) dados, bajo un
 *   advisory lock transaccional de Postgres (`pg_advisory_xact_lock`)
 *   scopeado a `tipoId:año`. Ver JSDoc del método para el detalle de la
 *   decisión de concurrencia (desvía la sugerencia literal de "FOR UPDATE"
 *   del design — ver deviación documentada en apply-progress).
 *
 * Tarea: T5.1, T5.2, T5.3
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '.prisma/tenant';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ITicketRepository, TicketFiltros } from '../../../domain/ports/i-ticket.repository';
import { TicketEntity } from '../../../domain/entities/ticket.entity';
import { TicketMapper } from './ticket.mapper';

@Injectable()
export class PrismaTicketRepository implements ITicketRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  /** Retorna el cliente Prisma del tenant activo. Lanza si no hay TenantContext activo. */
  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findById(id: string): Promise<TicketEntity | null> {
    const row = await this.client.ticket.findUnique({ where: { id } });
    return row ? TicketMapper.toDomain(row) : null;
  }

  async findByNumero(numero: string): Promise<TicketEntity | null> {
    const row = await this.client.ticket.findUnique({ where: { numero } });
    return row ? TicketMapper.toDomain(row) : null;
  }

  /**
   * Retorna la última secuencia LOCAL (tenant+tipo+año) usada en `numero`
   * (formato `{PREFIJO}-{AÑO}-{SEQ5}`). 0 si no hay tickets previos.
   *
   * Concurrencia (ADR-5): ANTES de leer, adquiere un advisory lock
   * transaccional de Postgres (`pg_advisory_xact_lock(hashtext(...))`)
   * scopeado a `tipoId:año`. A diferencia de `SELECT ... FOR UPDATE`
   * (sugerido en el design), un `FOR UPDATE` sobre un `MAX()` agregado no
   * es válido en Postgres, y bloquear la última fila existente NO protege
   * la creación del PRIMER ticket del año (no hay fila previa que lockear
   * — condición de carrera real en el caso "primer ticket del tipo/año").
   * El advisory lock serializa TODA la sección crítica (lectura de
   * secuencia + INSERT del ticket) para el mismo (tipoId, año), incluso
   * cuando aún no existe ninguna fila — garantía más fuerte que el bounded
   * retry alternativo del ADR. El lock se libera automáticamente al
   * cerrar la transacción (commit o rollback) — NUNCA hay que liberarlo
   * manualmente.
   *
   * CRÍTICO: esta protección solo aplica si `findLastSecuencia()` y el
   * `save()` subsiguiente del ticket corren DENTRO de la MISMA transacción
   * (`ITenantTransactionRunner.run(...)`, como hará `CrearTicketUseCase`
   * en PR6). Invocado fuera de una transacción explícita, Postgres abre
   * una transacción implícita de una sola sentencia: el lock se adquiere y
   * libera de inmediato, sin efecto de serialización (inofensivo para
   * lecturas simples, pero sin la garantía de concurrencia).
   */
  async findLastSecuencia(tipoId: string, anio: number): Promise<number> {
    const lockKey = `ticket-numero:${tipoId}:${anio}`;
    await this.client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const rows = await this.client.$queryRaw<Array<{ numero: string }>>`
      SELECT numero FROM tickets
      WHERE tipo_id = ${tipoId}::uuid AND numero LIKE ${`%-${anio}-%`}
      ORDER BY numero DESC
      LIMIT 1
    `;

    if (rows.length === 0) {
      return 0;
    }

    const partes = rows[0].numero.split('-');
    return parseInt(partes[partes.length - 1], 10) || 0;
  }

  /**
   * Construye la cláusula `where` combinable (AND) a partir de los filtros
   * de T7. Compartida por `findAll` y `count` — el total de paginación
   * (`count`) DEBE reflejar exactamente los mismos filtros que la página
   * (`findAll`), ignorando `limit`/`offset` (esos son de paginación, no de
   * filtrado). `busqueda` (B1, PR-B) agrega un `OR` ILIKE en
   * `titulo`/`descripcion`, combinado en AND con el resto de los filtros.
   */
  private buildWhere(filtros?: TicketFiltros): Prisma.TicketWhereInput {
    const where: Prisma.TicketWhereInput = { deletedAt: null };

    if (filtros?.estadoId) {
      where.estadoId = filtros.estadoId;
    }
    if (filtros?.tiposIds?.length) {
      where.tipoId = { in: filtros.tiposIds };
    }
    if (filtros?.prioridadId) {
      where.prioridadId = filtros.prioridadId;
    }
    if (filtros?.asignadoId) {
      where.asignadoId = filtros.asignadoId;
    }
    if (filtros?.soloSolicitante) {
      where.solicitanteId = filtros.soloSolicitante;
    }
    if (filtros?.cicloId) {
      where.cicloId = filtros.cicloId;
    }
    if (filtros?.fechaDesde || filtros?.fechaHasta) {
      where.createdAt = {
        ...(filtros.fechaDesde && { gte: filtros.fechaDesde }),
        ...(filtros.fechaHasta && { lte: filtros.fechaHasta }),
      };
    }
    if (filtros?.busqueda) {
      where.OR = [
        { titulo: { contains: filtros.busqueda, mode: 'insensitive' } },
        { descripcion: { contains: filtros.busqueda, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  /**
   * T7: filtros combinables (AND), excluye soft-deleted, orden
   * created_at DESC. `filtros.limit`/`filtros.offset` (PR6) aplican
   * paginación vía `take`/`skip`.
   */
  async findAll(filtros?: TicketFiltros): Promise<TicketEntity[]> {
    const rows = await this.client.ticket.findMany({
      where: this.buildWhere(filtros),
      orderBy: { createdAt: 'desc' },
      ...(filtros?.limit !== undefined && { take: filtros.limit }),
      ...(filtros?.offset !== undefined && { skip: filtros.offset }),
    });
    return rows.map(TicketMapper.toDomain);
  }

  /**
   * Cuenta el total de tickets que cumplen los filtros (AND), IGNORANDO
   * `limit`/`offset` — usado por `ListarTicketsUseCase` (PR6) para la
   * metadata de paginación (T7).
   */
  async count(filtros?: TicketFiltros): Promise<number> {
    return this.client.ticket.count({ where: this.buildWhere(filtros) });
  }

  async save(ticket: TicketEntity): Promise<void> {
    const data = TicketMapper.toPersistence(ticket);
    // createdAt se incluye en el CREATE; se excluye del UPDATE para nunca
    // pisar el timestamp de creación existente en DB.
    const { createdAt: _createdAt, ...updateData } = data;
    await this.client.ticket.upsert({
      where: { id: data.id },
      create: data,
      update: updateData,
    });
  }

  async delete(id: string): Promise<void> {
    await this.client.ticket.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
