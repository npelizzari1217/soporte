import { Injectable } from '@nestjs/common';
import { UsuarioEntity } from '../../auth/domain/entities/usuario.entity';
import { MembresiaEntity } from '../../auth/domain/entities/membresia.entity';
import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import { IUsuarioIntegracionRepository } from '../domain/usuario-integracion-repository.port';

/**
 * `createMany` con `skipDuplicates` es un `INSERT ... ON CONFLICT DO NOTHING`: si otra
 * habilitacion simultanea gano el insert, este no hace nada en vez de dar P2002 (JD-7).
 */
@Injectable()
export class PrismaUsuarioIntegracionRepository implements IUsuarioIntegracionRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client() {
    return this.prismaService.getMasterClient();
  }

  async crearUsuarioSiNoExiste(usuario: UsuarioEntity): Promise<void> {
    await this.client.usuario.createMany({
      data: [
        {
          id: usuario.id,
          email: usuario.email,
          nombre: usuario.nombre,
          apellido: usuario.apellido,
          passwordHash: usuario.passwordHash,
          activo: usuario.activo,
          isGlobalAdmin: usuario.isGlobalAdmin,
          esIntegracion: usuario.esIntegracion,
        },
      ],
      skipDuplicates: true,
    });
  }

  async crearMembresiaSiNoExiste(membresia: MembresiaEntity): Promise<void> {
    await this.client.membresia.createMany({
      data: [
        {
          id: membresia.id,
          usuarioId: membresia.usuarioId,
          clienteId: membresia.clienteId,
          rolId: membresia.rolId,
          activo: membresia.activo,
        },
      ],
      skipDuplicates: true,
    });
  }
}
