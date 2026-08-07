import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import {
  ContactoUsuario,
  IUsuarioContactoResolver,
} from '../../../domain/ports/i-usuario-contacto-resolver';

/**
 * PrismaUsuarioContactoResolver — implementación del puerto
 * IUsuarioContactoResolver (N4). Opera SIEMPRE sobre la DB MASTER
 * (`PrismaService.getMasterClient()`) — NO usa TenantContext, mismo
 * criterio que `UsuarioMasterChecker`/`PrismaTenantEnumerator`.
 *
 * Ref spec: sdd/premium/spec N4. Ref design: ADR-P8. Tarea: N9/N10.
 */
@Injectable()
export class PrismaUsuarioContactoResolver implements IUsuarioContactoResolver {
  constructor(private readonly prismaService: PrismaService) {}

  private get masterClient() {
    return this.prismaService.getMasterClient();
  }

  /**
   * `deletedAt IS NULL` — mismo criterio que `existeEnTenant`
   * (`IUsuarioMasterChecker`): NO filtra por `activo`, un solicitante
   * inactivo sigue siendo un contacto válido para notificaciones.
   */
  async resolverContacto(usuarioId: string): Promise<ContactoUsuario | null> {
    const row = await this.masterClient.usuario.findFirst({
      where: { id: usuarioId, deletedAt: null },
      select: { email: true, nombre: true },
    });
    return row;
  }

  /**
   * Membresías ACTIVAS (no soft-deleted) con `rol.codigo='ADMINISTRADOR'`,
   * de usuarios ACTIVOS y no soft-deleted, del cliente indicado.
   */
  async resolverAdministradores(clienteId: string): Promise<ContactoUsuario[]> {
    const rows = await this.masterClient.membresia.findMany({
      where: {
        clienteId,
        activo: true,
        deletedAt: null,
        rol: { codigo: 'ADMINISTRADOR' },
        usuario: { activo: true, deletedAt: null },
      },
      select: { usuario: { select: { email: true, nombre: true } } },
    });
    return rows.map((row: { usuario: ContactoUsuario }) => row.usuario);
  }
}
