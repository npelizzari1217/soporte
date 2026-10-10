import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import {
  IIdentidadSsoRepository,
  ResultadoVinculo,
} from '../../domain/ports/identidad-sso-repository.port';
import { ProveedorSso } from '../../domain/sso/proveedores-sso';

/**
 * Vinculos sobre `usuarios_identidades_sso` (master, ADR-4). `vincular` no usa upsert: un
 * `INSERT ... ON CONFLICT DO NOTHING` sin objetivo cubre ambos unicos y no lanza ante la carrera.
 */
@Injectable()
export class PrismaIdentidadSsoRepository implements IIdentidadSsoRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client() {
    return this.prismaService.getMasterClient();
  }

  async buscarUsuarioPorSujeto(proveedor: ProveedorSso, subject: string): Promise<string | null> {
    const fila = await this.client.usuarioIdentidadSso.findUnique({
      where: { proveedor_subject: { proveedor, subject } },
      select: { usuarioId: true },
    });
    return fila?.usuarioId ?? null;
  }

  async vincular(
    usuarioId: string,
    proveedor: ProveedorSso,
    subject: string,
  ): Promise<ResultadoVinculo> {
    await this.client.$executeRaw`
      INSERT INTO usuarios_identidades_sso (usuario_id, proveedor, subject)
      VALUES (${usuarioId}::uuid, ${proveedor}, ${subject})
      ON CONFLICT DO NOTHING`;
    const vinculo = await this.client.usuarioIdentidadSso.findUnique({
      where: { usuarioId_proveedor: { usuarioId, proveedor } },
      select: { subject: true },
    });
    // Sin fila: el insert perdio contra (proveedor, subject), esa cuenta es de otro usuario.
    return vinculo?.subject === subject ? 'VINCULADO' : 'OTRA_CUENTA';
  }

  async eliminarTodasDeUsuario(usuarioId: string): Promise<number> {
    const { count } = await this.client.usuarioIdentidadSso.deleteMany({ where: { usuarioId } });
    return count;
  }
}
