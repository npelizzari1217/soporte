/**
 * PrismaUsuarioRepository — implementación del puerto IUsuarioRepository.
 *
 * MasterContext-aware: si hay una transacción MASTER activa (BajaUsuarioUseCase,
 * AsignarRolUseCase), usa el tx client de MasterContext. De lo contrario, usa el
 * master client normal.
 *
 * Hydration W3: findByEmail/findById siempre incluyen el cascade completo
 *   usuariosRoles → rol → rolesPermisos → permiso
 * para que LoginUseCase pueda calcular los permisos efectivos sin más queries.
 *
 * save() sincroniza usuarios_roles: delete all + createMany con los roles actuales.
 * Esto es atómico cuando se llama dentro de masterTxRunner.run() (BajaUsuario, AsignarRol).
 *
 * Tarea: 2.C.2 + W3
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterContext } from '../../../../shared/tenancy/master-context';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IUsuarioRepository } from '../../../domain/ports/i-usuario.repository';
import { UsuarioEntity } from '../../../domain/entities/usuario.entity';
import { UsuarioMapper, USUARIO_INCLUDE } from './usuario.mapper';

@Injectable()
export class PrismaUsuarioRepository implements IUsuarioRepository {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly masterContext: MasterContext,
  ) {}

  /**
   * Retorna el cliente activo: tx si hay transacción MASTER, master client normal en caso contrario.
   */
  private get client(): InstanceType<typeof MasterPrismaClient> {
    const txClient = this.masterContext.getClient();
    if (txClient) {
      return txClient as InstanceType<typeof MasterPrismaClient>;
    }
    return this.prismaService.getMasterClient();
  }

  async findByEmail(email: string): Promise<UsuarioEntity | null> {
    const row = await this.client.usuario.findUnique({
      where: { email },
      include: USUARIO_INCLUDE,
    });
    return row ? UsuarioMapper.toDomain(row) : null;
  }

  async findById(id: string): Promise<UsuarioEntity | null> {
    const row = await this.client.usuario.findUnique({
      where: { id },
      include: USUARIO_INCLUDE,
    });
    return row ? UsuarioMapper.toDomain(row) : null;
  }

  async findByClienteId(clienteId: string): Promise<UsuarioEntity[]> {
    const rows = await this.client.usuario.findMany({
      where: { clienteId },
      include: USUARIO_INCLUDE,
    });
    return rows.map(UsuarioMapper.toDomain);
  }

  async save(usuario: UsuarioEntity): Promise<void> {
    const data = UsuarioMapper.toPersistence(usuario);
    const { id, ...updateData } = data;

    // 1. Upsert del usuario (INSERT si nuevo, UPDATE si existe)
    await this.client.usuario.upsert({
      where: { id },
      create: data,
      update: updateData,
    });

    // 2. Sincronizar usuarios_roles: delete todos los roles actuales del usuario,
    //    luego re-insertar los roles del dominio. Esto refleja el estado canónico
    //    de entity.roles (addRol + AsignarRolUseCase + suspend).
    await this.client.usuariosRoles.deleteMany({
      where: { usuarioId: usuario.id },
    });

    if (usuario.roles.length > 0) {
      await this.client.usuariosRoles.createMany({
        data: usuario.roles.map((r) => ({
          usuarioId: usuario.id,
          rolId: r.id,
        })),
        skipDuplicates: true,
      });
    }
  }
}
