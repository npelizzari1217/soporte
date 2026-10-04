/**
 * PrismaEquipoInformaticoRepository — implementación del puerto
 * IEquipoInformaticoRepository.
 *
 * Reglas:
 * - Obtiene el cliente Prisma del tenant activo vía TenantContext.getClient().
 *   NUNCA recibe PrismaService ni llama a PrismaService directamente.
 * - save() es un upsert por id (INSERT si nuevo, UPDATE si existe); nunca
 *   pisa `createdAt` en el UPDATE (mismo patrón que PrismaTicketRepository).
 * - save() NO escribe `activo` ni `baja_*` en el UPDATE: el único escritor de la baja es
 *   registrarBaja() (CAS). Así una entidad vieja no reactiva el equipo.
 * - bloquearParaModificar() / bloquearParaOperarPiezas() son el nivel LE del orden de locks
 *   (ADR-2): `FOR NO KEY UPDATE` / `FOR SHARE`, nunca `FOR UPDATE`.
 * - save() tampoco escribe `qr_*`: el único escritor del QR es guardarQrHash() (CAS).
 * - delete() es SIEMPRE soft delete (deletedAt), nunca DELETE físico.
 *
 * Tarea: T11.2.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IEquipoInformaticoRepository } from '../../../domain/ports/i-equipo-informatico.repository';
import { EquipoInformaticoEntity } from '../../../domain/entities/equipo-informatico.entity';
import { EquipoInformaticoMapper } from './equipo-informatico.mapper';
import { exigirTransaccionActiva } from '../../../../shared/infrastructure/persistence/exigir-transaccion-activa';

@Injectable()
export class PrismaEquipoInformaticoRepository implements IEquipoInformaticoRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findById(id: string): Promise<EquipoInformaticoEntity | null> {
    const row = await this.client.equipoInformatico.findUnique({ where: { id } });
    return row ? EquipoInformaticoMapper.toDomain(row) : null;
  }

  async findByNumeroSerie(numeroSerie: string): Promise<EquipoInformaticoEntity | null> {
    const row = await this.client.equipoInformatico.findFirst({
      where: { numeroSerie, deletedAt: null },
    });
    return row ? EquipoInformaticoMapper.toDomain(row) : null;
  }

  async findAllActive(): Promise<EquipoInformaticoEntity[]> {
    const rows = await this.client.equipoInformatico.findMany({
      where: { deletedAt: null, activo: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(EquipoInformaticoMapper.toDomain);
  }

  async findAllIncluyendoDadosDeBaja(): Promise<EquipoInformaticoEntity[]> {
    const rows = await this.client.equipoInformatico.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(EquipoInformaticoMapper.toDomain);
  }

  async save(equipo: EquipoInformaticoEntity): Promise<void> {
    const data = EquipoInformaticoMapper.toPersistence(equipo);
    const {
      createdAt: _createdAt,
      activo: _activo,
      bajaDestino: _bajaDestino,
      bajaCategoria: _bajaCategoria,
      bajaMotivo: _bajaMotivo,
      bajaFecha: _bajaFecha,
      bajaUsuarioId: _bajaUsuarioId,
      ...updateData
    } = data;
    await this.client.equipoInformatico.upsert({
      where: { id: data.id },
      create: data,
      update: updateData,
    });
  }

  async bloquearParaModificar(id: string): Promise<EquipoInformaticoEntity | null> {
    const client = this.client;
    exigirTransaccionActiva(
      this.tenantContext,
      'PrismaEquipoInformaticoRepository.bloquearParaModificar()',
    );
    await client.$queryRaw`
      SELECT id FROM equipos_informaticos WHERE id = ${id}::uuid FOR NO KEY UPDATE
    `;
    return this.findById(id);
  }

  async bloquearParaOperarPiezas(id: string): Promise<EquipoInformaticoEntity | null> {
    const client = this.client;
    exigirTransaccionActiva(
      this.tenantContext,
      'PrismaEquipoInformaticoRepository.bloquearParaOperarPiezas()',
    );
    await client.$queryRaw`
      SELECT id FROM equipos_informaticos WHERE id = ${id}::uuid FOR SHARE
    `;
    return this.findById(id);
  }

  async registrarBaja(equipo: EquipoInformaticoEntity): Promise<boolean> {
    const { count } = await this.client.equipoInformatico.updateMany({
      where: { id: equipo.id, activo: true, deletedAt: null },
      data: {
        activo: false,
        bajaDestino: equipo.bajaDestino,
        bajaCategoria: equipo.bajaCategoria,
        bajaMotivo: equipo.bajaMotivo,
        bajaFecha: equipo.bajaFecha,
        bajaUsuarioId: equipo.bajaUsuarioId,
      },
    });
    return count > 0;
  }

  async findByQrHash(qrTokenHash: string): Promise<EquipoInformaticoEntity | null> {
    const row = await this.client.equipoInformatico.findUnique({ where: { qrTokenHash } });
    return row ? EquipoInformaticoMapper.toDomain(row) : null;
  }

  async guardarQrHash(id: string, qrTokenHash: string, emitidoAt: Date): Promise<boolean> {
    const { count } = await this.client.equipoInformatico.updateMany({
      where: { id, activo: true, deletedAt: null },
      data: { qrTokenHash, qrEmitidoAt: emitidoAt },
    });
    return count > 0;
  }

  async delete(id: string): Promise<void> {
    await this.client.equipoInformatico.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
