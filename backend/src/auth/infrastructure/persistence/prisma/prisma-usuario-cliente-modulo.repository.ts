/**
 * PrismaUsuarioClienteModuloRepository — impl del puerto
 * IUsuarioClienteModuloRepository sobre la DB MASTER.
 *
 * Resuelve los módulos funcionales asignados a un usuario en un cliente
 * (tabla `usuario_cliente_modulos`) para poblar `modulos[]` del JWT en
 * login/switch/refresh (feature 5.2 CAPA 1). ROOT/ADMINISTRADOR NO pasan por
 * acá — resolverScope les asigna TODOS los módulos sin query.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { IUsuarioClienteModuloRepository } from '../../../domain/ports/i-usuario-cliente-modulo.repository';

@Injectable()
export class PrismaUsuarioClienteModuloRepository implements IUsuarioClienteModuloRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client() {
    return this.prismaService.getMasterClient();
  }

  async findModulosByUsuarioYCliente(usuarioId: string, clienteId: string): Promise<string[]> {
    const rows = await this.client.usuarioClienteModulo.findMany({
      where: { usuarioId, clienteId },
      select: { modulo: true },
    });
    return rows.map((r) => r.modulo);
  }

  async setModulos(usuarioId: string, clienteId: string, modulos: string[]): Promise<void> {
    // Dedup: la tabla tiene unique (usuarioId, clienteId, modulo); crear dos
    // filas con el mismo módulo reventaría el createMany.
    const modulosUnicos = [...new Set(modulos)];
    await this.client.$transaction(async (tx) => {
      await tx.usuarioClienteModulo.deleteMany({ where: { usuarioId, clienteId } });
      if (modulosUnicos.length > 0) {
        await tx.usuarioClienteModulo.createMany({
          data: modulosUnicos.map((modulo) => ({ usuarioId, clienteId, modulo })),
        });
      }
    });
  }
}
