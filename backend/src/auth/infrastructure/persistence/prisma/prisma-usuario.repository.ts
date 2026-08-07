/**
 * PrismaUsuarioRepository — implementación del puerto IUsuarioRepository.
 *
 * findByEmail/findById INCLUYEN soft-deleted a propósito: LoginUseCase (R3)
 * necesita distinguir "no existe" de "existe pero inactivo/borrado" para
 * ejecutar la defensa timing-safe (hashProvider.verify contra DUMMY_HASH)
 * de forma consistente en ambos casos, y el guard de auth necesita poder
 * rechazar cuentas suspendidas.
 *
 * Sin MasterContext-awareness (a diferencia de soporte1): PR5 no introduce
 * transacciones cross-repo — ese wiring queda para el PR que lo necesite en
 * concreto (CrearClienteUseCase, PR8).
 *
 * Tarea: T5.4 (PR5 — Persistencia + Prisma repos + TenantContext)
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { IUsuarioRepository } from '../../../domain/ports/i-usuario.repository';
import { UsuarioEntity } from '../../../domain/entities/usuario.entity';
import { UsuarioMapper } from './usuario.mapper';

@Injectable()
export class PrismaUsuarioRepository implements IUsuarioRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client() {
    return this.prismaService.getMasterClient();
  }

  async findByEmail(email: string): Promise<UsuarioEntity | null> {
    const row = await this.client.usuario.findUnique({ where: { email } });
    return row ? UsuarioMapper.toDomain(row) : null;
  }

  async findById(id: string): Promise<UsuarioEntity | null> {
    const row = await this.client.usuario.findUnique({ where: { id } });
    return row ? UsuarioMapper.toDomain(row) : null;
  }

  async create(entity: UsuarioEntity): Promise<void> {
    // Delega a save() (upsert): para entidades nuevas (id UUIDv7 generado en
    // el dominio), Prisma hará INSERT porque el id no existe aún en DB.
    await this.save(entity);
  }

  async save(usuario: UsuarioEntity): Promise<void> {
    const data = UsuarioMapper.toPersistence(usuario);
    const { id, ...updateData } = data;

    await this.client.usuario.upsert({
      where: { id },
      create: data,
      update: updateData,
    });
  }
}
