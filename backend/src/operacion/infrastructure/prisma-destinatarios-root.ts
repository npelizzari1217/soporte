import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import { IDestinatariosRoot } from '../application/avisar-saturacion-a-root';

/**
 * ROOT activos de soporte (`usuarios.is_global_admin`), destinatarios de los avisos de operación
 * (odd/saturacion-conexiones, S3). Quedan afuera los inactivos, los borrados y las cuentas de
 * integración de la API, que no son personas.
 */
export class PrismaDestinatariosRoot implements IDestinatariosRoot {
  constructor(private readonly prisma: PrismaService) {}

  /** @returns Los emails de los ROOT que pueden recibir el aviso. */
  async emailsDeRootActivos(): Promise<string[]> {
    const filas = await this.prisma.getMasterClient().usuario.findMany({
      where: { isGlobalAdmin: true, activo: true, deletedAt: null, esIntegracion: false },
      select: { email: true },
      orderBy: { email: 'asc' },
    });
    return filas.map((fila) => fila.email);
  }
}
