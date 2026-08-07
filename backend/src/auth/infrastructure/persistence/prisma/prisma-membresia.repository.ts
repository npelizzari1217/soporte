/**
 * PrismaMembresiaRepository — implementación del puerto IMembresiaRepository.
 *
 * Único repo de auth con JOIN de 3 niveles (membresia → cliente, membresia →
 * rol → rolesPermisos → permiso) — resuelve rol+permisos+cliente en una sola
 * query para no golpear la DB por cada claim del JWT (R4, R5, R6, R10).
 *
 * Filtra SIEMPRE `membresia.activo && !membresia.deletedAt` y
 * `cliente.activo && !cliente.deletedAt` (R4): una membresía "viva" pero
 * cuyo cliente fue suspendido/borrado NO cuenta como activa a los fines de
 * autenticación.
 *
 * Tarea: T5.3 (PR5 — Persistencia + Prisma repos + TenantContext)
 */
import { Injectable } from '@nestjs/common';
import type { Membresia as PrismaMembresiaRow, Usuario as PrismaUsuario } from '.prisma/master';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import {
  IMembresiaRepository,
  MembresiaConUsuario,
  MembresiaResuelta,
} from '../../../domain/ports/i-membresia.repository';
import { MembresiaEntity } from '../../../domain/entities/membresia.entity';
import { MembresiaMapper, PrismaMembresiaResuelta } from './membresia.mapper';

/** Include clause que resuelve el JOIN completo cliente + rol + permisos. */
const MEMBRESIA_RESUELTA_INCLUDE = {
  cliente: true,
  rol: {
    include: {
      rolesPermisos: {
        include: {
          permiso: true,
        },
      },
    },
  },
} as const;

@Injectable()
export class PrismaMembresiaRepository implements IMembresiaRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client() {
    return this.prismaService.getMasterClient();
  }

  async findActivasByUsuario(usuarioId: string): Promise<MembresiaResuelta[]> {
    const rows = await this.client.membresia.findMany({
      where: {
        usuarioId,
        activo: true,
        deletedAt: null,
        cliente: { activo: true, deletedAt: null },
      },
      include: MEMBRESIA_RESUELTA_INCLUDE,
    });
    return (rows as PrismaMembresiaResuelta[]).map(MembresiaMapper.toResuelta);
  }

  async findActivaByUsuarioYCliente(
    usuarioId: string,
    clienteId: string,
  ): Promise<MembresiaResuelta | null> {
    const row = await this.client.membresia.findFirst({
      where: {
        usuarioId,
        clienteId,
        activo: true,
        deletedAt: null,
        cliente: { activo: true, deletedAt: null },
      },
      include: MEMBRESIA_RESUELTA_INCLUDE,
    });
    return row ? MembresiaMapper.toResuelta(row as PrismaMembresiaResuelta) : null;
  }

  async create(membresia: MembresiaEntity): Promise<void> {
    await this.client.membresia.create({
      data: {
        id: membresia.id,
        usuarioId: membresia.usuarioId,
        clienteId: membresia.clienteId,
        rolId: membresia.rolId,
        activo: membresia.activo,
      },
    });
  }

  async findActivasByCliente(clienteId: string): Promise<MembresiaConUsuario[]> {
    const rows = await this.client.membresia.findMany({
      where: {
        clienteId,
        activo: true,
        deletedAt: null,
        usuario: { activo: true, deletedAt: null },
      },
      include: { usuario: true, rol: true },
    });
    return (
      rows as (PrismaMembresiaRow & { usuario: PrismaUsuario; rol: { codigo: string } })[]
    ).map((row) => ({
      membresiaId: row.id,
      usuarioId: row.usuario.id,
      nombre: row.usuario.nombre,
      apellido: row.usuario.apellido,
      email: row.usuario.email,
      rolCodigo: row.rol.codigo,
    }));
  }

  async findByUsuarioYCliente(
    usuarioId: string,
    clienteId: string,
  ): Promise<MembresiaEntity | null> {
    const row = await this.client.membresia.findFirst({
      where: { usuarioId, clienteId },
    });
    if (!row) {
      return null;
    }
    return MembresiaEntity.reconstitute(
      {
        usuarioId: row.usuarioId,
        clienteId: row.clienteId,
        rolId: row.rolId,
        activo: row.activo,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  async save(membresia: MembresiaEntity): Promise<void> {
    await this.client.membresia.update({
      where: { id: membresia.id },
      data: {
        rolId: membresia.rolId,
        activo: membresia.activo,
        updatedAt: membresia.updatedAt,
        deletedAt: membresia.deletedAt,
      },
    });
  }
}
