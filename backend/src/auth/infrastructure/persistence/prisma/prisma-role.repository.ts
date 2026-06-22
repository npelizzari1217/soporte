/**
 * PrismaRoleRepository — implementación del puerto IRoleRepository.
 *
 * No es MasterContext-aware porque los roles son datos de catálogo (read-only
 * en operaciones normales). Si se necesitara escritura de roles en el futuro,
 * se añade el MasterContext.
 *
 * findByCodigo: retorna RoleEntity básico (sin permisos).
 * findWithPermisos: retorna RoleEntity con permisos hidratados via JOIN.
 *
 * Tarea: 2.C.2
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { IRoleRepository } from '../../../domain/ports/i-role.repository';
import { RoleEntity } from '../../../domain/entities/role.entity';
import { RoleMapper } from './role.mapper';

@Injectable()
export class PrismaRoleRepository implements IRoleRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client() {
    return this.prismaService.getMasterClient();
  }

  async findByCodigo(codigo: string): Promise<RoleEntity | null> {
    const row = await this.client.role.findUnique({
      where: { codigo },
    });
    return row ? RoleMapper.toDomain(row) : null;
  }

  async findWithPermisos(id: string): Promise<RoleEntity | null> {
    const row = await this.client.role.findUnique({
      where: { id },
      include: {
        rolesPermisos: {
          include: {
            permiso: true,
          },
        },
      },
    });
    return row ? RoleMapper.toDomainWithPermisos(row) : null;
  }
}
