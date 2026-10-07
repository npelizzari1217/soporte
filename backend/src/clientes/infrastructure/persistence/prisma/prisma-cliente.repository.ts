/**
 * PrismaClienteRepository — implementación del puerto IClienteRepository.
 *
 * Alcance de PR5: `findById` es el método consumido en el camino caliente de
 * autenticación (`resolverScope`, R5/R10 — auth/application/use-cases). El
 * resto de la interfaz (findByDbName/findAll/save/delete) se implementa
 * completo acá porque:
 *   (a) TypeScript exige la implementación total de IClienteRepository, y
 *   (b) los tests de integración de este mismo PR necesitan `save()` para
 *       crear los clientes de fixture que consumen los repos de auth
 *       (usuario/membresia/refresh-token).
 * El caso de uso de orquestación completo (CrearClienteUseCase, con
 * provisioning físico) es scope de PR8 — acá no hay lógica de negocio
 * adicional, solo CRUD directo sobre `master.clientes`.
 *
 * Tarea: T5.4 (PR5 — Persistencia + Prisma repos + TenantContext)
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import {
  IClienteRepository,
  ResultadoCambioSlug,
} from '../../../domain/ports/i-cliente.repository';
import { ClienteEntity } from '../../../domain/entities/cliente.entity';
import { ClienteMapper } from './cliente.mapper';

@Injectable()
export class PrismaClienteRepository implements IClienteRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client(): InstanceType<typeof MasterPrismaClient> {
    return this.prismaService.getMasterClient();
  }

  async findById(id: string): Promise<ClienteEntity | null> {
    const row = await this.client.cliente.findUnique({ where: { id } });
    return row ? ClienteMapper.toDomain(row) : null;
  }

  async findByDbName(dbName: string): Promise<ClienteEntity | null> {
    const row = await this.client.cliente.findUnique({ where: { dbName } });
    return row ? ClienteMapper.toDomain(row) : null;
  }

  async findBySlug(slug: string): Promise<ClienteEntity | null> {
    const row = await this.client.cliente.findUnique({ where: { slug } });
    return row ? ClienteMapper.toDomain(row) : null;
  }

  async congelarSlug(id: string, slugEsperado: string): Promise<boolean> {
    const filas = await this.client.$executeRaw`
      UPDATE clientes
         SET slug_congelado_at = coalesce(slug_congelado_at, now())
       WHERE id = ${id}::uuid AND slug = ${slugEsperado}`;
    return filas > 0;
  }

  async cambiarSlugSiNoCongelado(id: string, nuevo: string): Promise<ResultadoCambioSlug> {
    try {
      const { count } = await this.client.cliente.updateMany({
        where: { id, slugCongeladoAt: null },
        data: { slug: nuevo },
      });
      return count > 0 ? 'CAMBIADO' : 'CONGELADO';
    } catch (err) {
      if (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002') {
        return 'DUPLICADO';
      }
      throw err;
    }
  }

  async fijarRequiere2fa(id: string, requiere: boolean): Promise<boolean> {
    const { count } = await this.client.cliente.updateMany({
      where: { id },
      data: { requiere2fa: requiere },
    });
    return count > 0;
  }

  async obtenerRequiere2fa(id: string): Promise<boolean | null> {
    const row = await this.client.cliente.findUnique({
      where: { id },
      select: { requiere2fa: true },
    });
    return row ? row.requiere2fa : null;
  }

  async findAll(): Promise<ClienteEntity[]> {
    const rows = await this.client.cliente.findMany();
    return rows.map(ClienteMapper.toDomain);
  }

  async save(cliente: ClienteEntity): Promise<void> {
    const data = ClienteMapper.toPersistence(cliente);
    const { id, ...updateData } = data;

    await this.client.cliente.upsert({
      where: { id },
      create: data,
      update: updateData,
    });
  }

  async delete(id: string): Promise<void> {
    await this.client.cliente.delete({ where: { id } });
  }
}
